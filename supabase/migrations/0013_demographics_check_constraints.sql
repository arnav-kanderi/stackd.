-- stackd. Section 3 (post-review fix) — profiles.grade/gender/
-- citizenship_status/gpa have no DB-level validation. RLS already confines a
-- malicious write to the writer's own row (not a cross-user security issue),
-- but nothing stops garbage data (gpa = -999999, grade = arbitrary string)
-- from degrading that user's own match-score/eligibility results. These
-- constraints mirror the exact option lists in
-- src/lib/onboarding/demographics.ts (GRADE_OPTIONS/GENDER_OPTIONS/
-- CITIZENSHIP_OPTIONS) — update both places together if the UI options ever
-- change.

alter table profiles
  add constraint profiles_grade_check
  check (grade is null or grade in ('9th', '10th', '11th', '12th', 'Freshman', 'Sophomore', 'Junior', 'Senior', 'Other'));

alter table profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('Female', 'Male', 'Non-binary', 'Prefer to self-describe', 'Prefer not to say'));

alter table profiles
  add constraint profiles_citizenship_status_check
  check (citizenship_status is null or citizenship_status in ('US Citizen', 'Permanent Resident', 'International Student', 'Other', 'Prefer not to say'));

alter table profiles
  add constraint profiles_gpa_check
  check (gpa is null or (gpa >= 0 and gpa <= 5));
