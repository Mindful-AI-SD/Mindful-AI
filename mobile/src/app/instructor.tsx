import { InstructorProgressScreen } from "@/components/instructor-progress-screen";
import { INSTRUCTOR_TEST_DATA } from "../../lib/instructor-progress";

export default function InstructorPreview() {
  return <InstructorProgressScreen data={INSTRUCTOR_TEST_DATA} />;
}
