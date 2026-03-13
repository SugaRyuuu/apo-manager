import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAppointmentRecord,
  createMember,
  getShiftAvailabilityLists,
  groupAppointmentsByDate,
  upsertShift,
  validateAppointment,
  validateMemberName,
} from "../src/logic.js";

test("validateMemberName rejects normalized duplicates", () => {
  const members = [createMember("田中 太郎")];
  assert.equal(validateMemberName("田中太郎", members), "同じ担当者名がすでに登録されています。");
  assert.equal(validateMemberName("鈴木 花子", members), null);
});

test("validateAppointment enforces required fields and duplicate detection", () => {
  const owner = createMember("担当者A");
  const existing = buildAppointmentRecord({
    name: "山田 花子",
    schoolAffiliation: "早稲田大学 / 政治経済学部",
    appointmentDate: "2026-03-20",
    ownerMemberId: owner.id,
    statusText: "",
    score: "60",
    traits: "",
  });

  const duplicate = buildAppointmentRecord({
    name: "山田花子",
    schoolAffiliation: "早稲田大学 / 政治経済学部",
    appointmentDate: "2026-03-21",
    ownerMemberId: owner.id,
    statusText: "",
    score: "90",
    traits: "",
  });

  assert.equal(
    validateAppointment(duplicate, [existing]),
    "同じ氏名と大学・学部のアポがすでに登録されています。",
  );

  const badScore = buildAppointmentRecord({
    name: "佐藤 次郎",
    schoolAffiliation: "慶應義塾大学 / 商学部",
    appointmentDate: "2026-03-22",
    ownerMemberId: owner.id,
    statusText: "",
    score: "101",
    traits: "",
  });
  assert.equal(
    validateAppointment(badScore, []),
    "評価は 1 から 100 の自然数で入力してください。",
  );
});

test("groupAppointmentsByDate sorts by date and exposes owner names", () => {
  const members = [createMember("担当者A"), createMember("担当者B")];
  const records = [
    buildAppointmentRecord({
      name: "B",
      schoolAffiliation: "大学",
      appointmentDate: "2026-03-11",
      ownerMemberId: members[1].id,
      statusText: "",
      score: "",
      traits: "",
    }),
    buildAppointmentRecord({
      name: "A",
      schoolAffiliation: "大学",
      appointmentDate: "2026-03-10",
      ownerMemberId: members[0].id,
      statusText: "",
      score: "",
      traits: "",
    }),
  ];

  const grouped = groupAppointmentsByDate(records, members);
  assert.equal(grouped[0].date, "2026-03-10");
  assert.equal(grouped[0].items[0].ownerName, "担当者A");
  assert.equal(grouped[1].date, "2026-03-11");
});

test("shift availability lists split day, night and unset members", () => {
  const members = [createMember("担当者A"), createMember("担当者B"), createMember("担当者C")];
  let shifts = [];
  shifts = upsertShift(shifts, {
    memberId: members[0].id,
    shiftDate: "2026-03-13",
    availability: "both",
  });
  shifts = upsertShift(shifts, {
    memberId: members[1].id,
    shiftDate: "2026-03-13",
    availability: "night",
  });

  const lists = getShiftAvailabilityLists(shifts, members, "2026-03-13");
  assert.deepEqual(lists.day, ["担当者A"]);
  assert.deepEqual(lists.night, ["担当者A", "担当者B"]);
  assert.deepEqual(lists.unset, ["担当者C"]);
});
