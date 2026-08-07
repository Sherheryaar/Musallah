import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";

import Touchable from "./Touchable";
import { type SubmissionResult } from "@/lib/feedback";
import { useTheme } from "@/context/ThemeContext";
import { spacing, radius, type ThemeColors } from "@/lib/theme";

// Visible cap, well under the database's 2000-char hard limit: suggestions
// are triaged by a human, and a screenful is the most anyone reads.
const MAX_INPUT_LENGTH = 600;
// A send needs enough text to be actionable — "wrong" tells us nothing.
const MIN_INPUT_LENGTH = 10;
// Only nag about the remaining budget once it's actually running out.
const SHOW_COUNTER_FROM = MAX_INPUT_LENGTH - 100;

/**
 * `.trim()` only strips whitespace (Unicode Zs), not zero-width FORMAT
 * characters like U+200B — so a message made entirely of those reads as
 * non-empty and long enough to send, but is visually blank. Strip them
 * before measuring so the minimum-length check means what it looks like.
 */
function visibleLength(text: string): number {
  return text.replace(/\p{Cf}/gu, "").trim().length;
}

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
  /** Focus the input (and raise the keyboard) as soon as the form shows. */
  autoFocus?: boolean;
  onSend: (message: string) => Promise<SubmissionResult>;
  onSent?: () => void;
};

export default function SuggestionForm({
  placeholder,
  sendLabel = "Send",
  topics,
  autoFocus,
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
  // something actionable. But topics still count toward what gets submitted.
  const trimmedLength = visibleLength(message);
  const canSend = trimmedLength >= MIN_INPUT_LENGTH;
  const tooShort = trimmedLength > 0 && !canSend;

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
              <Touchable
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
              </Touchable>
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
        maxLength={MAX_INPUT_LENGTH}
        textAlignVertical="top"
        editable={!sending}
        autoFocus={autoFocus}
        accessibilityLabel={placeholder}
      />
      {tooShort || message.length >= SHOW_COUNTER_FROM ? (
        <Text style={styles.inputMeta}>
          {tooShort
            ? "A few more words helps us act on it."
            : `${message.length}/${MAX_INPUT_LENGTH}`}
        </Text>
      ) : null}
      <Touchable
        style={[styles.sendButton, sending && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={sending || !canSend}
        accessibilityRole="button"
        accessibilityLabel={sendLabel}
      >
        {sending ? (
          <ActivityIndicator color={colors.canvas} size="small" />
        ) : (
          <Text style={styles.sendLabel}>{sendLabel}</Text>
        )}
      </Touchable>
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
      // 44pt: both platforms' guidelines want 44/48 for a tap target,
      // and these chips were 32.
      minHeight: 44,
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
    inputMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "right",
      marginTop: -spacing.s,
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
    // canvas, not white: the dark theme's accent is light — white would fail.
    sendLabel: {
      color: colors.canvas,
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
