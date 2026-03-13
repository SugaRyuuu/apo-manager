import { STORAGE_KEYS, createMember } from "./logic.js";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadState() {
  const members = readJson(STORAGE_KEYS.members, []);
  const appointments = readJson(STORAGE_KEYS.appointments, []);
  const shifts = readJson(STORAGE_KEYS.shifts, []);
  const currentMemberId = sessionStorage.getItem(STORAGE_KEYS.currentMemberId);

  if (members.length > 0) {
    return { members, appointments, shifts, currentMemberId: currentMemberId ?? members[0].id };
  }

  const seedMember = createMember("担当者A");
  writeJson(STORAGE_KEYS.members, [seedMember]);
  sessionStorage.setItem(STORAGE_KEYS.currentMemberId, seedMember.id);
  return {
    members: [seedMember],
    appointments,
    shifts,
    currentMemberId: seedMember.id,
  };
}

export function saveMembers(members) {
  writeJson(STORAGE_KEYS.members, members);
}

export function saveAppointments(appointments) {
  writeJson(STORAGE_KEYS.appointments, appointments);
}

export function saveShifts(shifts) {
  writeJson(STORAGE_KEYS.shifts, shifts);
}

export function saveCurrentMemberId(memberId) {
  sessionStorage.setItem(STORAGE_KEYS.currentMemberId, memberId);
}
