import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";

export default function ExploreScreen() {
  const router = useRouter();
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <ThemedText style={styles.eyebrow}>MINDFUL AI</ThemedText>
    <ThemedText style={styles.heading}>Explore your practice</ThemedText>
    <ThemedText style={styles.intro}>Mindfulness is a practice of noticing. Take your time and return whenever you are ready.</ThemedText>
    <View style={[styles.card, { backgroundColor: "#C4C7E0" }]}><ThemedText style={styles.kicker}>WEEK 1</ThemedText><ThemedText style={styles.cardTitle}>Mindful Attention</ThemedText><ThemedText style={styles.body}>Notice your thoughts and surroundings without judgment.</ThemedText></View>
    <View style={[styles.card, { backgroundColor: "#BFD8C8" }]}><ThemedText style={styles.kicker}>WEEK 2</ThemedText><ThemedText style={styles.cardTitle}>Body Awareness</ThemedText><ThemedText style={styles.body}>Explore physical sensations and learn to describe what you notice.</ThemedText></View>
    <Pressable onPress={() => router.replace("/")} style={styles.button} accessibilityRole="button"><ThemedText style={styles.buttonText}>Go to my activities  →</ThemedText></Pressable>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({screen:{flex:1,backgroundColor:"#F7F6F2"},content:{padding:22,gap:18,paddingBottom:90},eyebrow:{fontSize:12,letterSpacing:2,fontWeight:"700",color:"#747B9A"},heading:{fontSize:30,lineHeight:36,fontWeight:"700",color:"#252731"},intro:{fontSize:15,lineHeight:23,color:"#686B76",marginBottom:6},card:{borderRadius:26,padding:24,gap:12},kicker:{fontSize:12,letterSpacing:1.5,fontWeight:"700",color:"#454A65"},cardTitle:{fontSize:24,lineHeight:30,fontWeight:"700",color:"#252731"},body:{fontSize:15,lineHeight:23,color:"#454A65"},button:{borderRadius:24,backgroundColor:"#242630",padding:16,alignItems:"center"},buttonText:{color:"#FFFFFF",fontSize:15,fontWeight:"700"}});
