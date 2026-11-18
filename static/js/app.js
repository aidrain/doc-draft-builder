const draftForm = document.getElementById("draft-form");
const docTypeInput = document.getElementById("doc_type");
const titleInput = document.getElementById("title");
const recipientInput = document.getElementById("recipient");
const toneInput = document.getElementById("tone");
const datetimeInput = document.getElementById("datetime");
const locationInput = document.getElementById("location");
const targetInput = document.getElementById("target");
const applyMethodInput = document.getElementById("apply_method");
const contactInput = document.getElementById("contact");

const errorMessageBox = document.getElementById("error-message");
const loadingIndicator = document.getElementById("loading-indicator");
const loadFactsBtn = document.getElementById("load-facts-btn");
const fillExampleBtn = document.getElementById("fill-example-btn");
const factsStatus = document.getElementById("facts-status");
const generateBtn = document.getElementById("generate-btn");
const previewTab = document.getElementById("preview-tab");
const editTab = document.getElementById("edit-tab");
const draftPreview = document.getElementById("draft-preview");
const draftEditor = document.getElementById("draft-editor");
const copyBtn = document.getElementById("copy-btn");
const downloadBtn = document.getElementById("download-btn");
const copyStatus = document.getElementById("copy-status");

let currentDraft = "";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInlineMarkdown(escapedLine) {
  return escapedLine
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[확인 필요\]/g, '<span class="needs-check">[확인 필요]</span>');
}

function renderMarkdown(markdown) {
  if (!markdown.trim()) {
    return '<p class="placeholder-text">여기에 생성된 문서 초안이 표시됩니다.</p>';
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const htmlParts = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      htmlParts.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      htmlParts.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      closeLists();
      htmlParts.push("<hr>");
      continue;
    }

    if (trimmed.startsWith("### ")) {
      closeLists();
      htmlParts.push(`<h3>${formatInlineMarkdown(escapeHtml(trimmed.slice(4)))}</h3>`);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      closeLists();
      htmlParts.push(`<h2>${formatInlineMarkdown(escapeHtml(trimmed.slice(3)))}</h2>`);
      continue;
    }

    if (trimmed.startsWith("# ")) {
      closeLists();
      htmlParts.push(`<h1>${formatInlineMarkdown(escapeHtml(trimmed.slice(2)))}</h1>`);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeLists();
      htmlParts.push(`<blockquote>${formatInlineMarkdown(escapeHtml(trimmed.slice(2)))}</blockquote>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) {
        htmlParts.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        htmlParts.push("<ul>");
        inUl = true;
      }
      htmlParts.push(`<li>${formatInlineMarkdown(escapeHtml(ulMatch[1]))}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) {
        htmlParts.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        htmlParts.push("<ol>");
        inOl = true;
      }
      htmlParts.push(`<li>${formatInlineMarkdown(escapeHtml(olMatch[1]))}</li>`);
      continue;
    }

    closeLists();
    htmlParts.push(`<p>${formatInlineMarkdown(escapeHtml(trimmed))}</p>`);
  }

  closeLists();
  return htmlParts.join("\n");
}

function updateDraftView() {
  draftPreview.innerHTML = renderMarkdown(currentDraft);
  const hasDraft = Boolean(currentDraft.trim());
  copyBtn.disabled = !hasDraft;
  downloadBtn.disabled = !hasDraft;
}

function switchMode(mode) {
  const isEdit = mode === "edit";
  previewTab.classList.toggle("active", !isEdit);
  editTab.classList.toggle("active", isEdit);
  previewTab.setAttribute("aria-selected", String(!isEdit));
  editTab.setAttribute("aria-selected", String(isEdit));
  draftPreview.hidden = isEdit;
  draftEditor.hidden = !isEdit;
  if (isEdit) {
    draftEditor.focus();
  } else {
    updateDraftView();
  }
}

previewTab.addEventListener("click", () => switchMode("preview"));
editTab.addEventListener("click", () => switchMode("edit"));

draftEditor.addEventListener("input", () => {
  currentDraft = draftEditor.value;
  const hasDraft = Boolean(currentDraft.trim());
  copyBtn.disabled = !hasDraft;
  downloadBtn.disabled = !hasDraft;
  copyStatus.textContent = "";
});

const FACTS_STORAGE_KEY = "doc_draft_fact_cards";
const factInputs = [
  datetimeInput,
  locationInput,
  targetInput,
  applyMethodInput,
  contactInput,
];

function saveFactCards() {
  try {
    const facts = {
      datetime: datetimeInput.value,
      location: locationInput.value,
      target: targetInput.value,
      apply_method: applyMethodInput.value,
      contact: contactInput.value,
    };
    localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(facts));
  } catch (error) {
    // 브라우저 저장소 사용이 제한된 경우 무시
  }
}

function loadFactCards() {
  try {
    const raw = localStorage.getItem(FACTS_STORAGE_KEY);
    if (!raw) {
      factsStatus.textContent = "저장된 사실 카드가 없습니다.";
      return;
    }
    const facts = JSON.parse(raw);
    datetimeInput.value = facts.datetime || "";
    locationInput.value = facts.location || "";
    targetInput.value = facts.target || "";
    applyMethodInput.value = facts.apply_method || "";
    contactInput.value = facts.contact || "";
    clearError();
    factsStatus.textContent = "저장된 사실 카드를 불러왔습니다.";
  } catch (error) {
    factsStatus.textContent = "저장된 사실 카드를 불러오지 못했습니다.";
  }
}

for (const input of factInputs) {
  input.addEventListener("input", () => {
    saveFactCards();
    factsStatus.textContent = "";
  });
}

loadFactsBtn.addEventListener("click", loadFactCards);

fillExampleBtn.addEventListener("click", () => {
  docTypeInput.value = "안내문";
  toneInput.value = "공식적";
  titleInput.value = "2026학년도 1학기 교내 AI 특강 안내";
  recipientInput.value = "전체 재학생 및 교직원";
  datetimeInput.value = "2026. 5. 14.(목) 14:00~16:00";
  locationInput.value = "본관 3층 대회의실";
  targetInput.value = "학부생 선착순 50명";
  applyMethodInput.value = "학생포털 비교과 신청 페이지";
  contactInput.value = "교무처 교육혁신팀 (02-1234-5678)";
  saveFactCards();
  clearError();
  factsStatus.textContent = "";
  copyStatus.textContent = "";
});

function showError(message) {
  errorMessageBox.textContent = message;
  errorMessageBox.hidden = false;
}

function clearError() {
  errorMessageBox.textContent = "";
  errorMessageBox.hidden = true;
}

function setLoading(isLoading) {
  loadingIndicator.hidden = !isLoading;
  generateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? "생성 중..." : "초안 생성";
}

function buildSafeFilename(title) {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
  return `${cleaned || "document_draft"}.md`;
}

draftForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  copyStatus.textContent = "";

  const docType = docTypeInput.value.trim();
  const title = titleInput.value.trim();

  // 화면 측 필수 입력 검증
  const missing = [];
  if (!docType) {
    missing.push("문서 종류");
  }
  if (!title) {
    missing.push("제목");
  }

  if (missing.length > 0) {
    showError(`필수 입력 항목(${missing.join(", ")})을 입력해 주세요.`);
    if (!docType) {
      docTypeInput.focus();
    } else {
      titleInput.focus();
    }
    return;
  }

  const selectedPrompt = document.querySelector('input[name="prompt_type"]:checked');
  const payload = {
    doc_type: docType,
    title: title,
    recipient: recipientInput.value.trim(),
    tone: toneInput.value,
    datetime: datetimeInput.value.trim(),
    location: locationInput.value.trim(),
    target: targetInput.value.trim(),
    apply_method: applyMethodInput.value.trim(),
    contact: contactInput.value.trim(),
    prompt_type: selectedPrompt ? selectedPrompt.value : "A",
  };

  setLoading(true);
  copyBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    const response = await fetch("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      showError(result.error || "초안을 생성하지 못했습니다. 입력 내용을 확인해 주세요.");
      return;
    }

    currentDraft = result.draft || "";
    draftEditor.value = currentDraft;
    updateDraftView();
    switchMode("preview");
  } catch (error) {
    showError("서버와 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.");
  } finally {
    setLoading(false);
  }
});

function htmlToPlainText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const blocks = [];
  for (const node of temp.children) {
    if (node.tagName === "UL" || node.tagName === "OL") {
      const items = Array.from(node.querySelectorAll("li")).map((li, idx) =>
        node.tagName === "OL" ? `${idx + 1}. ${li.textContent}` : `• ${li.textContent}`
      );
      blocks.push(items.join("\n"));
    } else if (node.tagName === "HR") {
      blocks.push("--------------------");
    } else {
      blocks.push(node.textContent);
    }
  }
  return blocks.join("\n\n");
}

copyBtn.addEventListener("click", async () => {
  if (!currentDraft.trim()) {
    return;
  }

  const isEditMode = !draftEditor.hidden;
  if (isEditMode) {
    try {
      await navigator.clipboard.writeText(currentDraft);
      copyStatus.textContent = "마크다운 원문이 클립보드에 복사되었습니다.";
    } catch (error) {
      copyStatus.textContent = "복사에 실패했습니다. 입력창에서 내용을 직접 선택해 복사해 주세요.";
    }
    return;
  }

  const renderedHtml = renderMarkdown(currentDraft);
  const plainText = htmlToPlainText(renderedHtml);

  try {
    if (window.ClipboardItem && navigator.clipboard.write) {
      const item = new ClipboardItem({
        "text/html": new Blob([renderedHtml], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(plainText);
    }
    copyStatus.textContent = "미리보기 서식 그대로 클립보드에 복사되었습니다.";
  } catch (error) {
    try {
      await navigator.clipboard.writeText(plainText);
      copyStatus.textContent = "깔끔한 텍스트로 클립보드에 복사되었습니다.";
    } catch (fallbackError) {
      copyStatus.textContent = "복사에 실패했습니다. 미리보기 화면을 직접 드래그해서 복사해 주세요.";
    }
  }
});

downloadBtn.addEventListener("click", () => {
  if (!currentDraft) {
    return;
  }

  const blob = new Blob([currentDraft], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildSafeFilename(titleInput.value);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});
