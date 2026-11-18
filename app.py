from datetime import timedelta
import hashlib
import hmac
import logging
import os

from dotenv import load_dotenv
from flask import (
    Flask,
    jsonify,
    make_response,
    render_template,
    request,
    send_from_directory,
    session,
)
from google import genai

# .env 파일에서 환경변수(GEMINI_API_KEY, APP_PASSWORD 등)를 불러옵니다.
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Vercel 등 서버리스 환경에서도 세션 쿠키가 유지되도록 고정된 비밀키를 사용합니다.
_secret_seed = (
    os.getenv("FLASK_SECRET_KEY", "").strip()
    or os.getenv("APP_PASSWORD", "").strip()
    or "usw-doc-draft-builder-secret"
)
app.secret_key = hashlib.sha256(_secret_seed.encode("utf-8")).hexdigest()
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

MODEL_NAME = "gemini-3.5-flash-lite"
MIN_PASSWORD_LENGTH = 8


def get_app_password() -> str:
    """환경변수에서 접속 비밀번호를 읽습니다."""
    return os.getenv("APP_PASSWORD", "").strip()


def is_password_configured() -> bool:
    """8자리 이상의 접속 비밀번호가 설정되었는지 확인합니다."""
    return len(get_app_password()) >= MIN_PASSWORD_LENGTH


def build_prompt(data: dict) -> str:
    """사용자 입력과 Prompt A/B 선택에 따라 Gemini에 보낼 요청문을 만듭니다."""
    doc_type = data["doc_type"]
    title = data["title"]
    event_datetime = data.get("datetime", "").strip() or "(입력 없음)"
    location = data.get("location", "").strip() or "(입력 없음)"
    target = data.get("target", "").strip() or "(입력 없음)"
    apply_method = data.get("apply_method", "").strip() or "(입력 없음)"
    contact = data.get("contact", "").strip() or "(입력 없음)"
    recipient = data.get("recipient", "").strip() or "(입력 없음)"
    tone = data.get("tone", "공식적").strip() or "공식적"
    prompt_type = data.get("prompt_type", "A").strip().upper()

    facts_block = (
        f"- 문서 종류: {doc_type}\n"
        f"- 제목: {title}\n"
        f"- 받는 사람: {recipient}\n"
        f"- 어조: {tone}\n"
        f"- 일시: {event_datetime}\n"
        f"- 장소: {location}\n"
        f"- 대상: {target}\n"
        f"- 신청 방법: {apply_method}\n"
        f"- 문의처: {contact}"
    )

    if prompt_type == "B":
        return (
            "당신은 대학 행정 업무 문서를 작성하는 전문가입니다.\n"
            "아래 입력 정보를 바탕으로 대학 행정 문서 초안을 마크다운(Markdown) 형식으로 작성해 주세요.\n\n"
            "[필수 준수 규칙]\n"
            "1. 대학 행정 문서 체크리스트를 적용하세요: 6하원칙(누가, 언제, 어디서, 무엇을, 어떻게, 왜)을 점검하고, "
            "정중한 공식 문체를 사용하며, 문의처를 반드시 포함하세요.\n"
            "2. 입력 정보에 없는 내용은 절대 지어내지 말고 반드시 [확인 필요]로 표시하세요.\n"
            "   (예: '(입력 없음)'으로 되어 있거나 구체적 내용이 비어 있는 항목은 임의로 채우지 말고 [확인 필요]로 적으세요.)\n"
            f"3. 요청된 어조({tone})를 반영하되 행정 문서로서의 품격을 유지하세요.\n\n"
            "[입력 정보]\n"
            f"{facts_block}"
        )

    # Prompt A: 입력 정보로 해당 문서를 써 달라고만 요청
    return (
        "아래 입력 정보를 바탕으로 해당 문서를 작성해 주세요.\n\n"
        "[입력 정보]\n"
        f"{facts_block}"
    )


@app.route("/", methods=["GET"])
def index():
    """메인 화면 또는 비밀번호 잠금 화면을 보여줍니다."""
    return render_template(
        "index.html",
        authenticated=bool(session.get("authenticated")),
        password_configured=is_password_configured(),
    )


@app.route("/login", methods=["POST"])
def login():
    """접속 비밀번호를 검증하고 세션을 활성화합니다."""
    if not is_password_configured():
        logger.error("APP_PASSWORD가 설정되지 않았거나 8자리 미만입니다.")
        return (
            jsonify(
                {
                    "error": "서버에 8자리 이상의 접속 비밀번호(APP_PASSWORD)가 설정되지 않았습니다. 환경변수를 확인해 주세요."
                }
            ),
            500,
        )

    data = request.get_json(silent=True) or {}
    entered_password = str(data.get("password", "")).strip()

    if len(entered_password) < MIN_PASSWORD_LENGTH:
        return (
            jsonify({"error": f"비밀번호는 {MIN_PASSWORD_LENGTH}자리 이상 입력해 주세요."}),
            400,
        )

    expected_password = get_app_password()
    if not hmac.compare_digest(entered_password, expected_password):
        logger.warning("잘못된 접속 비밀번호 입력 시도가 있었습니다.")
        return jsonify({"error": "비밀번호가 올바르지 않습니다."}), 401

    session.permanent = True
    session["authenticated"] = True
    return jsonify({"ok": True})


@app.route("/logout", methods=["POST"])
def logout():
    """현재 세션을 잠금 상태로 되돌립니다."""
    session.clear()
    return jsonify({"ok": True})


@app.route("/sw.js", methods=["GET"])
def service_worker():
    """PWA 서비스 워커를 루트 스코프(/)로 제공합니다."""
    response = make_response(
        send_from_directory("static", "sw.js", mimetype="application/javascript")
    )
    response.headers["Service-Worker-Allowed"] = "/"
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.route("/generate", methods=["POST"])
def generate():
    """입력값을 검증하고 Gemini API를 호출해 문서 초안을 반환합니다."""
    if not session.get("authenticated"):
        return jsonify({"error": "비밀번호 인증이 필요합니다. 페이지를 새로고침해 주세요."}), 401

    data = request.get_json(silent=True) or {}

    doc_type = str(data.get("doc_type", "")).strip()
    title = str(data.get("title", "")).strip()

    # 서버 측 필수 입력 검증
    missing_fields = []
    if not doc_type:
        missing_fields.append("문서 종류")
    if not title:
        missing_fields.append("제목")

    if missing_fields:
        joined = ", ".join(missing_fields)
        logger.warning("필수 입력 누락 요청: %s", joined)
        return jsonify({"error": f"필수 입력 항목({joined})을 입력해 주세요."}), 400

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")
        return (
            jsonify(
                {
                    "error": "서버에 Gemini API 키가 설정되지 않았습니다. .env 파일의 GEMINI_API_KEY를 확인해 주세요."
                }
            ),
            500,
        )

    prompt_text = build_prompt(
        {
            "doc_type": doc_type,
            "title": title,
            "datetime": str(data.get("datetime", "")),
            "location": str(data.get("location", "")),
            "target": str(data.get("target", "")),
            "apply_method": str(data.get("apply_method", "")),
            "contact": str(data.get("contact", "")),
            "recipient": str(data.get("recipient", "")),
            "tone": str(data.get("tone", "공식적")),
            "prompt_type": str(data.get("prompt_type", "A")),
        }
    )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt_text,
        )
        draft = (response.text or "").strip()
        if not draft:
            logger.error("Gemini 응답 텍스트가 비어 있습니다.")
            return (
                jsonify({"error": "AI가 빈 응답을 반환했습니다. 잠시 후 다시 시도해 주세요."}),
                500,
            )
        return jsonify({"draft": draft})
    except Exception as exc:
        # API 키 등 민감 정보가 노출되지 않도록 예외 타입과 메시지만 서버 콘솔에 기록
        logger.exception("문서 초안 생성 중 오류 발생: %s", type(exc).__name__)
        return (
            jsonify(
                {
                    "error": "문서 초안을 생성하는 중 문제가 발생했습니다. 잠시 후 다시 시도하거나 API 키 및 네트워크 상태를 확인해 주세요."
                }
            ),
            500,
        )


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
