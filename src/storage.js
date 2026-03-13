import {
  STORAGE_KEYS,
  createMember,
  ensureMemberShape,
  normalizeName,
} from "./logic.js";
import { supabase, ensureSupabaseSession, isMissingTableError } from "./supabase.js";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function removeLegacyData() {
  localStorage.removeItem(STORAGE_KEYS.members);
  localStorage.removeItem(STORAGE_KEYS.appointments);
  localStorage.removeItem(STORAGE_KEYS.shifts);
}

function getLegacyState() {
  return {
    members: readJson(STORAGE_KEYS.members, []),
    appointments: readJson(STORAGE_KEYS.appointments, []),
    shifts: readJson(STORAGE_KEYS.shifts, []),
  };
}

function mapAppointmentFromDb(record) {
  return {
    id: record.id,
    name: record.name,
    schoolAffiliation: record.school_affiliation,
    appointmentDate: record.appointment_date,
    ownerMemberId: record.owner_member_id,
    statusText: record.status_text ?? "",
    score: record.score ?? null,
    traits: record.traits ?? "",
    deletedAt: record.deleted_at ?? null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function mapAppointmentToDb(record) {
  return {
    id: record.id,
    name: record.name,
    school_affiliation: record.schoolAffiliation,
    appointment_date: record.appointmentDate,
    owner_member_id: record.ownerMemberId,
    status_text: record.statusText || null,
    score: record.score,
    traits: record.traits || null,
    deleted_at: record.deletedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function mapShiftFromDb(record) {
  return {
    id: `${record.member_id}:${record.shift_date}`,
    memberId: record.member_id,
    shiftDate: record.shift_date,
    availability: record.availability,
    updatedAt: record.updated_at,
  };
}

function mapShiftToDb(record) {
  return {
    member_id: record.memberId,
    shift_date: record.shiftDate,
    availability: record.availability,
    updated_at: record.updatedAt,
  };
}

function normalizeStorageError(error) {
  if (!error) {
    return new Error("不明な保存エラーが発生しました。");
  }
  if (isMissingTableError(error)) {
    return new Error(
      "Supabase のテーブルが未作成です。supabase/schema.sql を SQL Editor で実行してください。",
    );
  }
  if (error.code === "23505") {
    return new Error("同じ名前の担当者または同じシフトがすでに存在します。");
  }
  return new Error(error.message ?? "Supabase との通信に失敗しました。");
}

async function fetchMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("id, display_name, normalized_name, created_at")
    .order("display_name", { ascending: true });

  if (error) throw normalizeStorageError(error);
  return data.map((member) => ({
    id: member.id,
    displayName: member.display_name,
    normalizedName: member.normalized_name,
    createdAt: member.created_at,
  }));
}

async function fetchAppointments() {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, name, school_affiliation, appointment_date, owner_member_id, status_text, score, traits, deleted_at, created_at, updated_at",
    )
    .order("appointment_date", { ascending: true });

  if (error) throw normalizeStorageError(error);
  return data.map(mapAppointmentFromDb);
}

async function fetchShifts() {
  const { data, error } = await supabase
    .from("shifts")
    .select("member_id, shift_date, availability, updated_at")
    .order("shift_date", { ascending: true });

  if (error) throw normalizeStorageError(error);
  return data.map(mapShiftFromDb);
}

async function uploadLegacyData(legacy) {
  if (legacy.members.length > 0) {
    const membersPayload = legacy.members.map((member) => ({
      id: member.id,
      display_name: member.displayName,
      normalized_name: member.normalizedName ?? normalizeName(member.displayName),
    }));
    const { error } = await supabase.from("members").upsert(membersPayload);
    if (error) throw normalizeStorageError(error);
  }

  if (legacy.appointments.length > 0) {
    const appointmentsPayload = legacy.appointments.map(mapAppointmentToDb);
    const { error } = await supabase.from("appointments").upsert(appointmentsPayload);
    if (error) throw normalizeStorageError(error);
  }

  if (legacy.shifts.length > 0) {
    const shiftsPayload = legacy.shifts.map(mapShiftToDb);
    const { error } = await supabase.from("shifts").upsert(shiftsPayload);
    if (error) throw normalizeStorageError(error);
  }

  removeLegacyData();
}

export async function loadState() {
  await ensureSupabaseSession();

  let members = await fetchMembers();
  let appointments = await fetchAppointments();
  let shifts = await fetchShifts();

  const legacy = getLegacyState();
  const hasLegacyData =
    legacy.members.length > 0 || legacy.appointments.length > 0 || legacy.shifts.length > 0;

  if (members.length === 0 && hasLegacyData) {
    await uploadLegacyData(legacy);
    members = await fetchMembers();
    appointments = await fetchAppointments();
    shifts = await fetchShifts();
  }

  if (members.length === 0) {
    const seedMember = createMember("担当者A");
    await createMemberRecord(seedMember.displayName, []);
    members = await fetchMembers();
  }

  const currentMemberId =
    sessionStorage.getItem(STORAGE_KEYS.currentMemberId) ?? members[0]?.id ?? null;
  return { members, appointments, shifts, currentMemberId };
}

export async function createMemberRecord(name, existingMembers) {
  const member = ensureMemberShape(createMember(name));
  const duplicate = existingMembers.some(
    (existing) => existing.normalizedName === member.normalizedName,
  );
  if (duplicate) {
    throw new Error("同じ担当者名がすでに登録されています。");
  }

  const { data, error } = await supabase
    .from("members")
    .insert({
      id: member.id,
      display_name: member.displayName,
      normalized_name: member.normalizedName,
    })
    .select("id, display_name, normalized_name")
    .single();

  if (error) throw normalizeStorageError(error);
  return {
    id: data.id,
    displayName: data.display_name,
    normalizedName: data.normalized_name,
  };
}

export async function saveAppointmentRecord(record) {
  const { data, error } = await supabase
    .from("appointments")
    .upsert(mapAppointmentToDb(record))
    .select(
      "id, name, school_affiliation, appointment_date, owner_member_id, status_text, score, traits, deleted_at, created_at, updated_at",
    )
    .single();

  if (error) throw normalizeStorageError(error);
  return mapAppointmentFromDb(data);
}

export async function softDeleteAppointmentRecord(record) {
  const { data, error } = await supabase
    .from("appointments")
    .update({
      deleted_at: record.deletedAt,
      updated_at: record.updatedAt,
    })
    .eq("id", record.id)
    .select(
      "id, name, school_affiliation, appointment_date, owner_member_id, status_text, score, traits, deleted_at, created_at, updated_at",
    )
    .single();

  if (error) throw normalizeStorageError(error);
  return mapAppointmentFromDb(data);
}

export async function saveShiftRecord(record) {
  const { data, error } = await supabase
    .from("shifts")
    .upsert(mapShiftToDb(record), { onConflict: "member_id,shift_date" })
    .select("member_id, shift_date, availability, updated_at")
    .single();

  if (error) throw normalizeStorageError(error);
  return mapShiftFromDb(data);
}

export async function refreshState() {
  await ensureSupabaseSession();
  const [members, appointments, shifts] = await Promise.all([
    fetchMembers(),
    fetchAppointments(),
    fetchShifts(),
  ]);
  return { members, appointments, shifts };
}

export function saveCurrentMemberId(memberId) {
  sessionStorage.setItem(STORAGE_KEYS.currentMemberId, memberId);
}
