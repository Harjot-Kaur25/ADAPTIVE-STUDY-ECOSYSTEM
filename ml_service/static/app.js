"use strict";

const form = document.querySelector("#recommendation-form");
const subjectsList = document.querySelector("#subjects-list");
const subjectTemplate = document.querySelector("#subject-template");
const addSubjectButton = document.querySelector("#add-subject");
const predictButton = document.querySelector("#predict-button");
const formMessage = document.querySelector("#form-message");
const resultsSection = document.querySelector("#results");
let subjectCount = 0;

function updateSubjectNumbers() {
  const cards = [...subjectsList.querySelectorAll(".subject-card")];
  cards.forEach((card, index) => {
    card.querySelector(".subject-number").textContent = String(index + 1).padStart(2, "0");
    card.querySelector(".subject-title h3").textContent = `Subject ${index + 1}`;
    card.querySelector(".remove-subject").disabled = cards.length === 1;
  });
}

function addSubject() {
  if (subjectCount >= 50) {
    formMessage.textContent = "You can submit up to 50 subjects at a time.";
    return;
  }
  const card = subjectTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector(".remove-subject").addEventListener("click", () => {
    card.remove();
    subjectCount -= 1;
    updateSubjectNumbers();
  });
  subjectsList.append(card);
  subjectCount += 1;
  updateSubjectNumbers();
  formMessage.textContent = "";
}

function readSubject(card) {
  const read = (name) => card.querySelector(`[data-field="${name}"]`).value;
  const subject = {
    subject_id: read("subject_id").trim(),
    subject_name: read("subject_name").trim(),
    average_marks: Number(read("average_marks")),
    exam_count: Number(read("exam_count")),
    total_study_hours: Number(read("total_study_hours")),
    completed_sessions: Number(read("completed_sessions")),
    missed_sessions: Number(read("missed_sessions")),
  };
  const examDate = read("upcoming_exam_date");
  if (examDate) subject.upcoming_exam_date = examDate;
  return subject;
}

function appendText(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function makeList(parent, title, items) {
  const wrapper = document.createElement("div");
  appendText(wrapper, "h4", title);
  const list = document.createElement("ul");
  items.forEach((item) => appendText(list, "li", item));
  wrapper.append(list);
  parent.append(wrapper);
}

function renderResults(body) {
  document.querySelector("#results-student").textContent =
    `${body.student_name} · ID ${body.student_id}`;
  const summary = document.querySelector("#summary");
  summary.replaceChildren();
  [
    ["HIGH", body.overall_summary.high_priority, "Needs attention first"],
    ["MEDIUM", body.overall_summary.medium_priority, "Plan regular revision"],
    ["LOW", body.overall_summary.low_priority, "Maintain progress"],
  ].forEach(([label, count, note]) => {
    const card = document.createElement("div");
    card.className = "summary-card";
    appendText(card, "div", String(count), "summary-count");
    appendText(card, "div", `${label} · ${note}`, "summary-label");
    summary.append(card);
  });

  const list = document.querySelector("#recommendations");
  list.replaceChildren();
  body.recommendations.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = `recommendation-card priority-${item.priority}`;
    const head = document.createElement("div");
    head.className = "recommendation-head";
    appendText(head, "h3", `${index + 1}. ${item.subject_name}`);
    appendText(head, "span", item.priority, "priority-pill");
    card.append(head);

    let meta = `${item.exam_count} exam(s) · ${item.total_study_hours} study hours · ${item.completed_sessions} completed · ${item.missed_sessions} missed`;
    if (item.days_remaining !== null) meta += ` · exam in ${item.days_remaining} day(s)`;
    appendText(card, "p", meta, "subject-meta");

    const columns = document.createElement("div");
    columns.className = "result-columns";
    makeList(columns, "Key factors", item.key_factors);
    makeList(columns, "Suggested next steps", item.recommendations);
    card.append(columns);

    const scores = document.createElement("div");
    scores.className = "score-list";
    Object.entries(item.class_scores).forEach(([priority, score]) => {
      appendText(scores, "span", `${priority} model score: ${(score * 100).toFixed(1)}%`, "score-chip");
    });
    card.append(scores);
    list.append(card);
  });
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  if (!form.reportValidity()) {
    formMessage.textContent = "Please check the highlighted fields and enter valid values.";
    return;
  }
  const ids = [...subjectsList.querySelectorAll('[data-field="subject_id"]')]
    .map((input) => input.value.trim());
  if (new Set(ids).size !== ids.length) {
    formMessage.textContent = "Each subject needs a unique subject ID.";
    return;
  }

  const data = new FormData(form);
  const payload = {
    student_id: String(data.get("student_id")).trim(),
    student_name: String(data.get("student_name")).trim(),
    subjects: [...subjectsList.querySelectorAll(".subject-card")].map(readSubject),
  };
  predictButton.disabled = true;
  predictButton.classList.add("is-loading");
  predictButton.querySelector(".button-label").textContent = "Generating recommendations";
  try {
    const response = await fetch("/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error?.message || `Request failed (${response.status}).`);
    }
    renderResults(result);
  } catch (error) {
    formMessage.textContent = error instanceof Error
      ? error.message
      : "The service could not be reached. Check that Flask is running.";
  } finally {
    predictButton.disabled = false;
    predictButton.classList.remove("is-loading");
    predictButton.querySelector(".button-label").textContent = "Predict study priorities";
  }
});

addSubjectButton.addEventListener("click", addSubject);
addSubject();
