export const STORAGE_KEYS = {
  members: "apo-manager.members",
  appointments: "apo-manager.appointments",
  shifts: "apo-manager.shifts",
  currentMemberId: "apo-manager.current-member-id",
};

export const SHIFT_OPTIONS = [
  { value: "unset", label: "未入力" },
  { value: "day", label: "昼間 (12:00-17:00)" },
  { value: "night", label: "夜 (17:00-22:00)" },
  { value: "both", label: "どちらも参加可能" },
  { value: "unavailable", label: "参加不可能" },
];

export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

export function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function getShiftMonths(baseYear = new Date().getFullYear()) {
  return [3, 4, 5].map((month) => ({
    key: `${baseYear}-${String(month).padStart(2, "0")}`,
    year: baseYear,
    month,
    label: `${month}月`,
  }));
}

export function getDatesForMonth(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

export function ensureMemberShape(member) {
  return {
    id: member.id ?? createId("member"),
    displayName: String(member.displayName ?? "").trim(),
    normalizedName: normalizeName(member.displayName),
  };
}

export function validateMemberName(name, members) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    return "担当者名を入力してください。";
  }
  const normalized = normalizeName(trimmed);
  const duplicate = members.some((member) => member.normalizedName === normalized);
  if (duplicate) {
    return "同じ担当者名がすでに登録されています。";
  }
  return null;
}

export function createMember(name) {
  return ensureMemberShape({
    id: createId("member"),
    displayName: String(name).trim(),
  });
}

export function buildAppointmentRecord(input, previousRecord = null) {
  return {
    id: previousRecord?.id ?? createId("appointment"),
    name: String(input.name ?? "").trim(),
    schoolAffiliation: String(input.schoolAffiliation ?? "").trim(),
    appointmentDate: String(input.appointmentDate ?? ""),
    ownerMemberId: String(input.ownerMemberId ?? ""),
    statusText: String(input.statusText ?? "").trim(),
    score: input.score === "" || input.score == null ? null : Number(input.score),
    traits: String(input.traits ?? "").trim(),
    deletedAt: previousRecord?.deletedAt ?? null,
    createdAt: previousRecord?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateAppointment(record, appointments) {
  if (!record.name) return "相手名は必須です。";
  if (!record.schoolAffiliation) return "大学・学部は必須です。";
  if (!record.appointmentDate) return "アポ日付は必須です。";
  if (!record.ownerMemberId) return "担当者を選択してください。";

  if (record.score != null) {
    if (!Number.isInteger(record.score) || record.score < 1 || record.score > 100) {
      return "評価は 1 から 100 の自然数で入力してください。";
    }
  }

  const duplicate = appointments.find((appointment) => {
    if (appointment.deletedAt) return false;
    if (appointment.id === record.id) return false;
    return (
      normalizeName(appointment.name) === normalizeName(record.name) &&
      normalizeText(appointment.schoolAffiliation) === normalizeText(record.schoolAffiliation)
    );
  });
  if (duplicate) {
    return "同じ氏名と大学・学部のアポがすでに登録されています。";
  }

  return null;
}

export function groupAppointmentsByDate(appointments, members, searchTerm = "") {
  const normalizedSearch = normalizeText(searchTerm);
  const memberMap = new Map(members.map((member) => [member.id, member.displayName]));
  const filtered = appointments
    .filter((appointment) => !appointment.deletedAt)
    .filter((appointment) => {
      if (!normalizedSearch) return true;
      const ownerName = memberMap.get(appointment.ownerMemberId) ?? "";
      const haystack = normalizeText(
        `${appointment.name} ${appointment.schoolAffiliation} ${appointment.statusText} ${ownerName}`,
      );
      return haystack.includes(normalizedSearch);
    })
    .sort((left, right) => {
      if (left.appointmentDate !== right.appointmentDate) {
        return left.appointmentDate.localeCompare(right.appointmentDate);
      }
      return normalizeName(left.name).localeCompare(normalizeName(right.name));
    });

  const grouped = new Map();
  for (const appointment of filtered) {
    if (!grouped.has(appointment.appointmentDate)) {
      grouped.set(appointment.appointmentDate, []);
    }
    grouped.get(appointment.appointmentDate).push({
      ...appointment,
      ownerName: memberMap.get(appointment.ownerMemberId) ?? "未登録",
    });
  }

  return [...grouped.entries()].map(([date, items]) => ({ date, items }));
}

export function softDeleteAppointment(appointment) {
  return {
    ...appointment,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function buildShiftRecord({ memberId, shiftDate, availability }) {
  return {
    id: `${memberId}:${shiftDate}`,
    memberId,
    shiftDate,
    availability,
    updatedAt: new Date().toISOString(),
  };
}

export function upsertShift(shifts, input) {
  const record = buildShiftRecord(input);
  const next = shifts.filter(
    (shift) => !(shift.memberId === record.memberId && shift.shiftDate === record.shiftDate),
  );
  next.push(record);
  return next.sort((left, right) => left.shiftDate.localeCompare(right.shiftDate));
}

export function getShiftByMemberAndDate(shifts, memberId, shiftDate) {
  return (
    shifts.find((shift) => shift.memberId === memberId && shift.shiftDate === shiftDate)?.availability ??
    "unset"
  );
}

export function getShiftAvailabilityLists(shifts, members, shiftDate) {
  const memberMap = new Map(members.map((member) => [member.id, member.displayName]));
  const shiftMap = new Map(
    shifts.filter((shift) => shift.shiftDate === shiftDate).map((shift) => [shift.memberId, shift.availability]),
  );

  const result = {
    day: [],
    night: [],
    unset: [],
  };

  for (const member of members) {
    const availability = shiftMap.get(member.id) ?? "unset";
    const name = memberMap.get(member.id) ?? member.displayName;

    if (availability === "day" || availability === "both") {
      result.day.push(name);
    }
    if (availability === "night" || availability === "both") {
      result.night.push(name);
    }
    if (availability === "unset") {
      result.unset.push(name);
    }
  }

  result.day.sort((a, b) => a.localeCompare(b, "ja"));
  result.night.sort((a, b) => a.localeCompare(b, "ja"));
  result.unset.sort((a, b) => a.localeCompare(b, "ja"));
  return result;
}
