import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { socketService } from '../../api/socket';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { useT } from '../../utils/i18n';

const TIPS = [
  'Keep your booking on KaamWalla to maintain your service history and applicable warranty coverage.',
  'Payments or deals made privately outside KaamWalla may not be eligible for platform support or warranty.',
  'Keep job details and payments on KaamWalla for a clearer record if something goes wrong.',
  'Stay protected — complete your booking through KaamWalla for platform support and dispute assistance.',
  'Transactions outside KaamWalla may not be covered by our 3-month parts warranty on eligible services.',
];

// Memoized per-message row so appending one message doesn't re-render the whole
// history (the chat list grows continuously during a conversation).
const MessageRow = React.memo(function MessageRow({ item, userId }: { item: any; userId: string }) {
  const t = useT();
  if (item.type === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{t(item.content)}</Text>
      </View>
    );
  }
  const mine = item.senderId === userId;
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      <Text style={[styles.text, mine && styles.mineText]}>{item.content}</Text>
    </View>
  );
});

export default function ChatScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id) || '';
  const t = useT();

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!bookingId) return;

    // Ensure socket is connected before registering listeners
    socketService.connect();

    // Fetch history
    apiClient.get(`/bookings/${bookingId}/messages`)
      .then(res => setMessages(res.data?.data || []))
      .finally(() => setLoading(false));

    // Join room
    socketService.joinBookingChat(bookingId);

    // Live messages
    const addMessage = (msg: any) => {
      setMessages(prev => {
        const updated = [...prev, msg];
        if (updated.length >= 5 && !tip) {
          const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];
          setTimeout(() => setTip(randomTip), 1000);
          if (tipTimer.current) clearTimeout(tipTimer.current);
          tipTimer.current = setTimeout(() => { setTip(null); tipTimer.current = null; }, 7000);
        }
        return updated;
      });
    };
    socketService.on('new_message', addMessage);
    socketService.on('new_system_message', addMessage);

    // Listen for warning from server (e.g. sharing contact info)
    socketService.on('chat_warning', (data: { message: string; muted?: boolean; mutedForSec?: number; violations?: number }) => {
      const msg = typeof data === 'string' ? data : data.message;
      const violations = (data as any)?.violations;
      setWarning(violations && violations >= 2 ? `(${violations}x) ${msg}` : msg);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      const duration = (data as any)?.mutedForSec ? Math.min((data as any).mutedForSec * 1000, 5000) : 4000;
      warningTimer.current = setTimeout(() => setWarning(null), duration);
    });

    return () => {
      socketService.off('new_message');
      socketService.off('new_system_message');
      socketService.off('chat_warning');
      if (warningTimer.current) clearTimeout(warningTimer.current);
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
    // tip is set from inside this mount-once socket effect (one-time chat tip);
    // adding it would re-fetch history and re-subscribe on every tip change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const sendMessage = () => {
    if (!text.trim() || !bookingId) return;
    socketService.sendMessage(bookingId, text);
    setText('');
  };

  const renderItem = useCallback(({ item }: { item: any }) => <MessageRow item={item} userId={userId} />, [userId]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('KaamWalla Chat')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {warning && (
        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#FFF" />
          <Text style={styles.warningText}>{warning}</Text>
        </View>
      )}
      {tip && (
        <View style={styles.tipBanner}>
          <MaterialCommunityIcons name="lightbulb-outline" size={16} color="#FF5C00" />
          <Text style={styles.tipText}>{t(tip)}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        automaticOffset
      >
        {loading ? (
          <ActivityIndicator style={styles.center} color="#FF5C00" />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            contentContainerStyle={styles.chatList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            // Chat history can grow large — render in batches, recycle rows, and
            // only render what's near the viewport.
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            removeClippedSubviews={Platform.OS === 'android'}
            windowSize={5}
          />
        )}

        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('Type a message...')}
            placeholderTextColor="#999"
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
            accessibilityLabel={t('Message input')}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!text.trim()}
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('Send message')}
            accessibilityState={{ disabled: !text.trim() }}
          >
            <MaterialCommunityIcons name="send" size={20} color="#FFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  backBtn: { padding: 8 },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#8B1A1A', paddingVertical: 10, paddingHorizontal: 20,
  },
  warningText: { color: '#FFF', fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  tipBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF0E8', paddingVertical: 10, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,92,0,0.15)',
  },
  tipText: { color: '#6B6B6B', fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 17 },
  center: { flex: 1, justifyContent: 'center' },
  chatList: { padding: 16 },
  systemRow: { alignItems: 'center', paddingVertical: 8 },
  systemText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#9E9E9E', textAlign: 'center', fontStyle: 'italic' },
  bubble: { padding: 12, borderRadius: 16, marginVertical: 4, maxWidth: '80%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#0D0D0D' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#EDE8DC' },
  text: { color: '#0D0D0D', fontSize: 14, fontFamily: 'Inter_400Regular' },
  mineText: { color: '#FFFFFF' },
  inputArea: { flexDirection: 'row', padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#DDD' },
  input: { flex: 1, fontSize: 14, color: '#0D0D0D', padding: 8 },
  sendBtn: { backgroundColor: '#FF5C00', padding: 12, borderRadius: 20 },
  sendBtnDisabled: { backgroundColor: '#D8CDBF', opacity: 0.8 },
});
