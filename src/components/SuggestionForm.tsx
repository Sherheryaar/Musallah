import React, { useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";

import { colors, spacing, radius } from "@/lib/theme";

type Props = {
  placeholder: string;
  sendLabel?: string;
  onSend: (message: string) => Promise<boolean>;
  onSent?: () => void;
};

export default function SuggestionForm({
  placeholder,
  sendLabel = "Send",
  onSend,
  onSent,
}: Props) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (sending || sent || !message.trim()) return;
    setSending(true);
    const stored = await onSend(message);
    setSending(false);
    if (stored) {
      setSent(true);
      setMessage("");
      onSent?.();
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
      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline
        textAlignVertical="top"
        editable={!sending}
        accessibilityLabel={placeholder}
      />
      <TouchableOpacity
        style={[styles.sendButton, sending && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={sending || !message.trim()}
        accessibilityRole="button"
        accessibilityLabel={sendLabel}
      >
        {sending ? (
          <ActivityIndicator color={colors.canvas} size="small" />
        ) : (
          <Text style={styles.sendLabel}>{sendLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l,
    gap: spacing.m,
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
});
