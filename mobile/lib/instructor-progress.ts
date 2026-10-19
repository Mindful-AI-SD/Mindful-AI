export type InstructorStatus = "not_started" | "in_progress" | "completed";
export type InstructorSnapshot = Readonly<{
  course: Readonly<{ id: string; title: string }>;
  weeks: readonly Readonly<{
    number: number;
    title: string;
    activities: readonly Readonly<{ id: string; title: string }>[];
  }>[];
  roster: readonly Readonly<{ id: string; name: string }>[];
  progress: readonly Readonly<{ studentId: string; activityId: string; status: InstructorStatus }>[];
}>;

export const INSTRUCTOR_STATUS_LABELS: Readonly<Record<InstructorStatus, string>> = {
  not_started: "Not started", in_progress: "In progress", completed: "Completed",
};

export function activityStatus(data: InstructorSnapshot, studentId: string, activityId: string): InstructorStatus {
  return data.progress.find(item => item.studentId === studentId && item.activityId === activityId)?.status ?? "not_started";
}

export function weekStatus(data: InstructorSnapshot, studentId: string, weekNumber: number): InstructorStatus {
  const activities = data.weeks.find(week => week.number === weekNumber)?.activities ?? [];
  if (activities.length === 0) return "not_started";
  const statuses = activities.map(activity => activityStatus(data, studentId, activity.id));
  if (statuses.every(status => status === "completed")) return "completed";
  return statuses.some(status => status !== "not_started") ? "in_progress" : "not_started";
}

export function progressTotals(data: InstructorSnapshot, studentId?: string) {
  const students = studentId ? data.roster.filter(student => student.id === studentId) : data.roster;
  const activities = data.weeks.flatMap(week => week.activities);
  const statuses = students.flatMap(student => activities.map(activity => activityStatus(data, student.id, activity.id)));
  return {
    students: students.length, weeks: data.weeks.length, activities: activities.length,
    possible: statuses.length,
    completed: statuses.filter(status => status === "completed").length,
    inProgress: statuses.filter(status => status === "in_progress").length,
    notStarted: statuses.filter(status => status === "not_started").length,
    completedWeeks: students.reduce((total, student) => total + data.weeks.filter(week => weekStatus(data, student.id, week.number) === "completed").length, 0),
  };
}

// Synthetic status-only fixtures. No student work or database reads are used.
const weeks: InstructorSnapshot["weeks"] = [
  { number: 1, title: "Mindful Attention", activities: [
    { id: "w1-arrive", title: "Arrive: Mood and energy" },
    { id: "w1-practice", title: "Practice: Mindful breathing" },
    { id: "w1-explore", title: "Explore: Intention Mirror" },
    { id: "w1-notice", title: "Notice the gap" },
  ] },
  { number: 2, title: "Body Awareness", activities: [
    { id: "w2-arrive", title: "Arrive: Body-map check-in" },
    { id: "w2-practice", title: "Practice: Body awareness" },
    { id: "w2-explore", title: "Explore: Sensation Lexicon" },
    { id: "w2-notice", title: "Notice: Tracker ethics and closing reflection" },
  ] },
];
const roster: InstructorSnapshot["roster"] = [
  { id: "demo-01", name: "Student 01" }, { id: "demo-02", name: "Student 02" }, { id: "demo-03", name: "Student 03" },
];
export const INSTRUCTOR_TEST_DATA: InstructorSnapshot = {
  course: { id: "demo-course", title: "Mindful AI — Test course" }, weeks, roster,
  progress: roster.flatMap((student, studentIndex) => weeks.flatMap(week => week.activities).map((activity, index) => ({
    studentId: student.id, activityId: activity.id,
    status: studentIndex === 0 || (studentIndex === 1 && index < 5) ? "completed" : studentIndex === 1 && index === 5 ? "in_progress" : "not_started",
  }))),
};
