import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";

import { MAX_MESSAGE_LENGTH, type SubmissionResult } from "@/lib/feedback";
import { useTheme } from "@/context/ThemeContext";
import { spacing, radius, type ThemeColors } from "@/lib/theme";

type Props = {
  placeholder: string;
  sendLabel?: string;
  /**
   * Optional quick-pick topics ("Prayer times", "Facilities", ...) shown as
   * tappable chips above the text box. Selected topics are prefixed to the
   * submitted message, so suggestions arrive pre-categorised for triage —
   * and users don't have to write a sentence to say what kind of problem
   * it is.
   */
  topics?: string[];
  onSend: (message: string) => Promise<SubmissionResult>;
  onSent?: () => void;
};

export default function SuggestionForm({
  placeholder,
  sendLabel = "Send",
  topics,
  onSend,
  onSent,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [message, setMessage] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic)
        ? prev.filter((t) => t !== topic)
        : [...prev, topic],
    );
  };

  // A topic selection alone is not enough to send — the message must say
  // something. But topics still count toward what gets submitted.
  const canSend = message.trim().length > 0;

  const handleSend = async () => {
    if (sending || sent || !canSend) return;
    setSending(true);
    setNote(null);
    try {
      const full =
        selectedTopics.length > 0
          ? `[${selectedTopics.join(", ")}] ${message}`
          : message;
      const result = await onSend(full);
      if (result === "stored") {
        setSent(true);
        setMessage("");
        onSent?.();
      } else if (result === "email") {
        // This used to fail silently: the spinner stopped and the form just
        // sat there while an email draft opened underneath. Say what happened.
        setNote(
          "We couldn't reach the database, so your email app was opened instead — send the email to finish.",
        );
      } else {
        setNote(
          "Couldn't send right now — check your connection and try again.",
        );
      }
    } catch {
      setNote(
        "Couldn't send right now — check your connection and try again.",
      );
    } finally {
      // finally: if onSend ever throws, the button must not be stuck on a
      // spinner forever.
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.card}>
        <Text style={styles.successText}>JazakAllah khair — suggestion sent.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {topics?.length ? (
        <View style={styles.topicsRow}>
          {topics.map((topic) => {
            const active = selectedTopics.includes(topic);
            return (
              <TouchableOpacity
                key={topic}
                style={[styles.topicChip, active && styles.topicChipActive]}
                onPress={() => toggleTopic(topic)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`Topic: ${topic}`}
              >
                <Text
                  style={[
                    styles.topicLabel,
                    active && styles.topicLabelActive,
                  ]}
                >
                  {topic}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={MAX_MESSAGE_LENGTH}
        textAlignVertical="top"
        editable={!sending}
        accessibilityLabel={placeholder}
      />
      <TouchableOpacity
        style={[styles.sendButton, sending && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={sending || !canSend}
        accessibilityRole="button"
        accessibilityLabel={sendLabel}
      >
        {sending ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.sendLabel}>{sendLabel}</Text>
        )}
      </TouchableOpacity>
      {note ? <Text style={styles.noteText}>{note}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.canvas,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.l,
      gap: spacing.m,
    },
    topicsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.s,
    },
    topicChip: {
      minHeight: 32,
      justifyContent: "center",
      paddingHorizontal: spacing.m,
      paddingVertical: spacing.xs,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    topicChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    topicLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    topicLabelActive: {
      color: colors.accent,
    },
    input: {
      minHeight: 88,
      fontSize: 16,
      color: colors.text,
      lineHeight: 22,
      padding: spacing.m,
      backgroundColor: colors.surface,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sendButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.m,
      paddingVertical: spacing.m,
      alignItems: "center",
      minHeight: 44,
      justifyContent: "center",
    },
    sendButtonDisabled: {
      opacity: 0.6,
    },
    sendLabel: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600",
    },
    successText: {
      fontSize: 14,
      color: colors.positive,
      lineHeight: 20,
      textAlign: "center",
    },
    noteText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      textAlign: "center",
    },
  });
