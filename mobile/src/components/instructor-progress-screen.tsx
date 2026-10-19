import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AccessibleHeading } from "./accessibility";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { activityStatus, weekStatus, progressTotals, INSTRUCTOR_STATUS_LABELS, type InstructorSnapshot } from "../../lib/instructor-progress";

export function InstructorProgressScreen({ data }: { data: InstructorSnapshot }) {
  const totals = progressTotals(data);
  return <ThemedView style={styles.flex}>
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <AccessibleHeading>Instructor progress</AccessibleHeading>
        <ThemedText>Read-only preview · Test data</ThemedText>
        <ThemedText>Sample course content and synthetic students. This preview shows completion summaries only.</ThemedText>
        <ThemedText type="subtitle" accessibilityRole="header">{data.course.title}</ThemedText>
        <View style={styles.card}>
          <ThemedText type="subtitle" accessibilityRole="header">Course totals</ThemedText>
          <ThemedText>{`${totals.students} students · ${totals.weeks} weeks · ${totals.activities} activities`}</ThemedText>
          <ThemedText>{`${totals.completed} of ${totals.possible} student activities completed`}</ThemedText>
          <ThemedText>{`${totals.inProgress} in progress · ${totals.notStarted} not started`}</ThemedText>
          <ThemedText>{`${totals.completedWeeks} of ${totals.students * totals.weeks} student weeks completed`}</ThemedText>
        </View>

        <ThemedText type="subtitle" accessibilityRole="header">Course content</ThemedText>
        {data.weeks.length === 0 && <ThemedText>No course content is available.</ThemedText>}
        {data.weeks.map(week => <View key={week.number} style={styles.card}>
          <ThemedText type="smallBold" accessibilityRole="header">{`Week ${week.number}: ${week.title}`}</ThemedText>
          {week.activities.length === 0 && <ThemedText>No activities are available for this week.</ThemedText>}
          {week.activities.map(activity => {
            const complete = data.roster.filter(student => activityStatus(data, student.id, activity.id) === "completed").length;
            return <View key={activity.id} style={styles.row}>
              <ThemedText>{activity.title}</ThemedText>
              <ThemedText>{`${complete} of ${totals.students} students completed`}</ThemedText>
            </View>;
          })}
        </View>)}

        <ThemedText type="subtitle" accessibilityRole="header">Roster and progress</ThemedText>
        {data.roster.length === 0 && <ThemedText>No students are enrolled.</ThemedText>}
        {data.roster.map(student => {
          const total = progressTotals(data, student.id);
          return <View key={student.id} style={styles.card}>
            <ThemedText type="subtitle" accessibilityRole="header">{student.name}</ThemedText>
            <ThemedText>{`${total.completed} of ${total.activities} activities completed · ${total.completedWeeks} of ${total.weeks} weeks completed`}</ThemedText>
            {data.weeks.map(week => <View key={week.number} style={styles.section}>
              <ThemedText type="smallBold" accessibilityRole="header">{`Week ${week.number} — ${INSTRUCTOR_STATUS_LABELS[weekStatus(data, student.id, week.number)]}`}</ThemedText>
              {week.activities.map(activity => <View key={activity.id} style={styles.row} accessible
                accessibilityLabel={`${student.name}. Week ${week.number}. ${activity.title}. ${INSTRUCTOR_STATUS_LABELS[activityStatus(data, student.id, activity.id)]}.`}>
                <ThemedText>{activity.title}</ThemedText>
                <ThemedText>{INSTRUCTOR_STATUS_LABELS[activityStatus(data, student.id, activity.id)]}</ThemedText>
              </View>)}
            </View>)}
          </View>;
        })}
      </ScrollView>
    </SafeAreaView>
  </ThemedView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { width: "100%", maxWidth: 900, alignSelf: "center", padding: 24, paddingTop: Platform.OS === "web" ? 88 : 24, paddingBottom: 48, gap: 24 },
  card: { gap: 16, padding: 20, borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 12 },
  section: { gap: 12 }, row: { gap: 4, paddingVertical: 8 },
});
