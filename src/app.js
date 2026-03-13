import {
  SHIFT_OPTIONS,
  buildAppointmentRecord,
  formatDate,
  getDatesForMonth,
  getShiftAvailabilityLists,
  getShiftByMemberAndDate,
  getShiftMonths,
  groupAppointmentsByDate,
  softDeleteAppointment,
  validateAppointment,
  validateMemberName,
} from "./logic.js";
import {
  createMemberRecord,
  loadState,
  saveCurrentMemberId,
  refreshState,
  saveAppointmentRecord,
  saveShiftRecord,
  softDeleteAppointmentRecord,
} from "./storage.js";

const state = {
  members: [],
  appointments: [],
  shifts: [],
  currentMemberId: null,
  activeView: "appointments",
  activeShiftMonthKey: getShiftMonths()[0].key,
  editingAppointmentId: null,
  loading: true,
  busy: false,
  errorMessage: "",
};

const elements = {
  currentMemberSelect: document.querySelector("#current-member-select"),
  memberCreateForm: document.querySelector("#member-create-form"),
  newMemberName: document.querySelector("#new-member-name"),
  statusBanner: document.querySelector("#status-banner"),
  navButtons: [...document.querySelectorAll(".nav-btn")],
  views: {
    appointments: document.querySelector("#appointments-view"),
    shifts: document.querySelector("#shifts-view"),
  },
  appointmentForm: document.querySelector("#appointment-form"),
  appointmentFormTitle: document.querySelector("#appointment-form-title"),
  appointmentCancelBtn: document.querySelector("#appointment-cancel-btn"),
  appointmentFields: {
    id: document.querySelector("#appointment-id"),
    name: document.querySelector("#appointment-name"),
    schoolAffiliation: document.querySelector("#appointment-school"),
    appointmentDate: document.querySelector("#appointment-date"),
    ownerMemberId: document.querySelector("#appointment-owner"),
    statusText: document.querySelector("#appointment-status"),
    score: document.querySelector("#appointment-score"),
    traits: document.querySelector("#appointment-traits"),
  },
  appointmentSearch: document.querySelector("#appointment-search"),
  appointmentsSummary: document.querySelector("#appointments-summary"),
  appointmentsList: document.querySelector("#appointments-list"),
  appointmentTemplate: document.querySelector("#appointment-card-template"),
  shiftMonthTabs: document.querySelector("#shift-month-tabs"),
  shiftForm: document.querySelector("#shift-form"),
  shiftDateSelect: document.querySelector("#shift-date-select"),
  shiftAvailabilitySelect: document.querySelector("#shift-availability-select"),
  shiftDayLookup: document.querySelector("#shift-day-lookup"),
  shiftDaySummary: document.querySelector("#shift-day-summary"),
  dayMembersList: document.querySelector("#day-members-list"),
  nightMembersList: document.querySelector("#night-members-list"),
  unsetMembersList: document.querySelector("#unset-members-list"),
};

function getCurrentMember() {
  return state.members.find((member) => member.id === state.currentMemberId) ?? state.members[0];
}

function setCurrentMember(memberId) {
  state.currentMemberId = memberId;
  saveCurrentMemberId(memberId);
}

function setStatus(message = "", tone = "info") {
  state.errorMessage = message;
  elements.statusBanner.textContent = message;
  elements.statusBanner.dataset.tone = tone;
  elements.statusBanner.classList.toggle("hidden", !message);
}

function setBusy(nextBusy) {
  state.busy = nextBusy;
  const controls = [
    elements.currentMemberSelect,
    elements.newMemberName,
    elements.appointmentSearch,
    elements.shiftDateSelect,
    elements.shiftAvailabilitySelect,
    elements.shiftDayLookup,
    ...elements.navButtons,
    ...document.querySelectorAll("button"),
    ...document.querySelectorAll("input"),
    ...document.querySelectorAll("select"),
    ...document.querySelectorAll("textarea"),
  ];
  for (const control of controls) {
    if (control) {
      control.disabled = nextBusy;
    }
  }
}

function renderMemberOptions() {
  const options = state.members
    .map(
      (member) =>
        `<option value="${member.id}" ${member.id === state.currentMemberId ? "selected" : ""}>${member.displayName}</option>`,
    )
    .join("");
  elements.currentMemberSelect.innerHTML = options;
  elements.appointmentFields.ownerMemberId.innerHTML = options;

  const editingOwnerId = state.editingAppointmentId
    ? state.appointments.find((item) => item.id === state.editingAppointmentId)?.ownerMemberId
    : null;
  elements.appointmentFields.ownerMemberId.value = editingOwnerId ?? state.currentMemberId;
}

function renderView() {
  for (const button of elements.navButtons) {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  }
  for (const [viewName, node] of Object.entries(elements.views)) {
    node.classList.toggle("active", viewName === state.activeView);
  }
}

function resetAppointmentForm() {
  state.editingAppointmentId = null;
  elements.appointmentForm.reset();
  elements.appointmentFields.id.value = "";
  elements.appointmentFields.ownerMemberId.value = state.currentMemberId;
  elements.appointmentFormTitle.textContent = "新規アポ登録";
  elements.appointmentCancelBtn.classList.add("hidden");
}

function startAppointmentEdit(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return;

  state.editingAppointmentId = appointmentId;
  elements.appointmentFields.id.value = appointment.id;
  elements.appointmentFields.name.value = appointment.name;
  elements.appointmentFields.schoolAffiliation.value = appointment.schoolAffiliation;
  elements.appointmentFields.appointmentDate.value = appointment.appointmentDate;
  elements.appointmentFields.ownerMemberId.value = appointment.ownerMemberId;
  elements.appointmentFields.statusText.value = appointment.statusText ?? "";
  elements.appointmentFields.score.value = appointment.score ?? "";
  elements.appointmentFields.traits.value = appointment.traits ?? "";
  elements.appointmentFormTitle.textContent = "アポを編集";
  elements.appointmentCancelBtn.classList.remove("hidden");
  elements.views.appointments.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAppointments() {
  const groups = groupAppointmentsByDate(
    state.appointments,
    state.members,
    elements.appointmentSearch.value,
  );
  const visibleCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  elements.appointmentsSummary.innerHTML = `
    <div><strong>${visibleCount}</strong> 件表示</div>
    <div><strong>${groups.length}</strong> 日程</div>
    <div><strong>${formatDate(groups[0]?.date ?? "") || "予定なし"}</strong> から確認</div>
  `;

  if (groups.length === 0) {
    elements.appointmentsList.innerHTML = `<p class="empty-state">該当するアポはまだありません。</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "date-group";
    const heading = document.createElement("div");
    heading.className = "date-group-head";
    heading.innerHTML = `<h3>${formatDate(group.date)}</h3><span>${group.items.length}件</span>`;
    section.append(heading);

    const cards = document.createElement("div");
    cards.className = "cards";
    for (const appointment of group.items) {
      const card = elements.appointmentTemplate.content.firstElementChild.cloneNode(true);
      card.querySelector(".appointment-name").textContent = appointment.name;
      card.querySelector(".appointment-school").textContent = appointment.schoolAffiliation;
      card.querySelector(".appointment-owner").textContent = `担当: ${appointment.ownerName}`;
      card.querySelector(".appointment-status").textContent = appointment.statusText || "状態未設定";
      card.querySelector(".appointment-score").textContent =
        appointment.score != null ? `評価: ${appointment.score}` : "評価未設定";
      card.querySelector(".appointment-traits").textContent =
        appointment.traits || "新入生特徴はまだ登録されていません。";

      const canEdit = appointment.ownerMemberId === state.currentMemberId;
      const actions = card.querySelector(".card-actions");
      if (!canEdit) {
        actions.innerHTML = `<p class="helper">自分が担当のアポのみ編集できます。</p>`;
      } else {
        card.querySelector(".edit-btn").addEventListener("click", () => startAppointmentEdit(appointment.id));
        card.querySelector(".delete-btn").addEventListener("click", async () => {
          const confirmed = window.confirm(`${appointment.name} さんのアポを削除しますか？`);
          if (!confirmed) return;
          try {
            setBusy(true);
            setStatus("");
            const deletedRecord = softDeleteAppointment(appointment);
            const saved = await softDeleteAppointmentRecord(deletedRecord);
            state.appointments = state.appointments.map((item) =>
              item.id === saved.id ? saved : item,
            );
            if (state.editingAppointmentId === appointment.id) {
              resetAppointmentForm();
            }
            renderAppointments();
          } catch (error) {
            setStatus(error.message, "error");
          } finally {
            setBusy(false);
          }
        });
      }

      cards.append(card);
    }
    section.append(cards);
    fragment.append(section);
  }

  elements.appointmentsList.innerHTML = "";
  elements.appointmentsList.append(fragment);
}

function renderShiftMonthTabs() {
  const months = getShiftMonths();
  elements.shiftMonthTabs.innerHTML = months
    .map(
      (month) => `
        <button
          class="month-tab ${month.key === state.activeShiftMonthKey ? "active" : ""}"
          type="button"
          data-month-key="${month.key}"
        >
          ${month.label}
        </button>
      `,
    )
    .join("");

  for (const button of elements.shiftMonthTabs.querySelectorAll(".month-tab")) {
    button.addEventListener("click", () => {
      state.activeShiftMonthKey = button.dataset.monthKey;
      renderShiftMonthTabs();
      renderShiftDateSelects();
    });
  }
}

function renderShiftDateSelects() {
  const [yearString, monthString] = state.activeShiftMonthKey.split("-");
  const dates = getDatesForMonth(Number(yearString), Number(monthString));

  const options = dates
    .map((date) => `<option value="${date}">${formatDate(date)}</option>`)
    .join("");
  elements.shiftDateSelect.innerHTML = options;

  const previousLookup = elements.shiftDayLookup.value;
  if (!previousLookup || !dates.includes(previousLookup)) {
    elements.shiftDayLookup.innerHTML = options;
    elements.shiftDayLookup.value = dates[0];
  } else {
    elements.shiftDayLookup.innerHTML = options;
    elements.shiftDayLookup.value = previousLookup;
  }

  const currentMember = getCurrentMember();
  if (currentMember) {
    elements.shiftAvailabilitySelect.value = getShiftByMemberAndDate(
      state.shifts,
      currentMember.id,
      elements.shiftDateSelect.value,
    );
  }
  renderShiftDayLists();
}

function renderShiftAvailabilityOptions() {
  elements.shiftAvailabilitySelect.innerHTML = SHIFT_OPTIONS.map(
    (option) => `<option value="${option.value}">${option.label}</option>`,
  ).join("");
}

function renderShiftDayLists() {
  const lookupDate = elements.shiftDayLookup.value || elements.shiftDateSelect.value;
  const availability = getShiftAvailabilityLists(state.shifts, state.members, lookupDate);

  elements.shiftDaySummary.innerHTML = `
    <div><strong>${formatDate(lookupDate)}</strong></div>
    <div><strong>${availability.day.length}</strong> 人が昼参加可能</div>
    <div><strong>${availability.night.length}</strong> 人が夜参加可能</div>
  `;

  renderNameList(elements.dayMembersList, availability.day, "昼に参加可能な担当者はいません。");
  renderNameList(elements.nightMembersList, availability.night, "夜に参加可能な担当者はいません。");
  renderNameList(elements.unsetMembersList, availability.unset, "未入力の担当者はいません。");
}

function renderNameList(node, names, emptyMessage) {
  if (names.length === 0) {
    node.innerHTML = `<li class="empty-item">${emptyMessage}</li>`;
    return;
  }
  node.innerHTML = names.map((name) => `<li>${name}</li>`).join("");
}

function bindEvents() {
  elements.currentMemberSelect.addEventListener("change", (event) => {
    setCurrentMember(event.target.value);
    renderMemberOptions();
    if (!state.editingAppointmentId) {
      elements.appointmentFields.ownerMemberId.value = state.currentMemberId;
    }
    renderAppointments();
    renderShiftDateSelects();
  });

  elements.memberCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = validateMemberName(elements.newMemberName.value, state.members);
    if (error) {
      setStatus(error, "error");
      return;
    }

    try {
      setBusy(true);
      setStatus("");
      const member = await createMemberRecord(elements.newMemberName.value, state.members);
      state.members = [...state.members, member].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "ja"),
      );
      setCurrentMember(member.id);
      elements.newMemberName.value = "";
      renderMemberOptions();
      renderAppointments();
      renderShiftDateSelects();
    } catch (submitError) {
      setStatus(submitError.message, "error");
    } finally {
      setBusy(false);
    }
  });

  for (const button of elements.navButtons) {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      renderView();
    });
  }

  elements.appointmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const previousRecord = state.appointments.find(
      (appointment) => appointment.id === elements.appointmentFields.id.value,
    );
    const record = buildAppointmentRecord(
      {
        name: elements.appointmentFields.name.value,
        schoolAffiliation: elements.appointmentFields.schoolAffiliation.value,
        appointmentDate: elements.appointmentFields.appointmentDate.value,
        ownerMemberId: elements.appointmentFields.ownerMemberId.value,
        statusText: elements.appointmentFields.statusText.value,
        score: elements.appointmentFields.score.value,
        traits: elements.appointmentFields.traits.value,
      },
      previousRecord,
    );

    const error = validateAppointment(record, state.appointments);
    if (error) {
      setStatus(error, "error");
      return;
    }

    const isEditingOthersRecord =
      previousRecord && previousRecord.ownerMemberId !== state.currentMemberId;
    if (isEditingOthersRecord) {
      setStatus("自分が担当のアポのみ編集できます。", "error");
      return;
    }

    try {
      setBusy(true);
      setStatus("");
      const savedRecord = await saveAppointmentRecord(record);
      const nextAppointments = previousRecord
        ? state.appointments.map((appointment) =>
            appointment.id === savedRecord.id ? savedRecord : appointment,
          )
        : [...state.appointments, savedRecord];
      state.appointments = nextAppointments;
      resetAppointmentForm();
      renderAppointments();
    } catch (submitError) {
      setStatus(submitError.message, "error");
    } finally {
      setBusy(false);
    }
  });

  elements.appointmentCancelBtn.addEventListener("click", () => {
    resetAppointmentForm();
  });

  elements.appointmentSearch.addEventListener("input", () => {
    renderAppointments();
  });

  elements.shiftDateSelect.addEventListener("change", () => {
    const currentMember = getCurrentMember();
    elements.shiftAvailabilitySelect.value = getShiftByMemberAndDate(
      state.shifts,
      currentMember.id,
      elements.shiftDateSelect.value,
    );
  });

  elements.shiftForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentMember = getCurrentMember();
    try {
      setBusy(true);
      setStatus("");
      const savedShift = await saveShiftRecord({
        memberId: currentMember.id,
        shiftDate: elements.shiftDateSelect.value,
        availability: elements.shiftAvailabilitySelect.value,
        updatedAt: new Date().toISOString(),
      });
      const remaining = state.shifts.filter(
        (shift) =>
          !(
            shift.memberId === savedShift.memberId &&
            shift.shiftDate === savedShift.shiftDate
          ),
      );
      state.shifts = [...remaining, savedShift].sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
      renderShiftDayLists();
    } catch (submitError) {
      setStatus(submitError.message, "error");
    } finally {
      setBusy(false);
    }
  });

  elements.shiftDayLookup.addEventListener("change", () => {
    renderShiftDayLists();
  });
}

async function init() {
  try {
    setBusy(true);
    setStatus("Supabase からデータを読み込んでいます。");
    const loadedState = await loadState();
    state.members = loadedState.members;
    state.appointments = loadedState.appointments;
    state.shifts = loadedState.shifts;
    state.currentMemberId = loadedState.currentMemberId;
  } catch (error) {
    setStatus(error.message, "error");
    return;
  } finally {
    setBusy(false);
  }

  renderMemberOptions();
  renderView();
  renderShiftMonthTabs();
  renderShiftAvailabilityOptions();
  renderShiftDateSelects();
  resetAppointmentForm();
  renderAppointments();
  bindEvents();
  setStatus("Supabase 同期中。別ブラウザでも同じデータを参照します。", "success");
}

init();
