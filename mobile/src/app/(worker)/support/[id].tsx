import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { apiClient } from '../../../api/client';
import { useAuthStore } from '../../../store/auth.store';
import { useT } from '../../../utils/i18n';
import { socketService } from '../../../api/socket';

export default function UserTicketDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const t = useT();
  const { user } = useAuthStore();
  
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get(`/support/${id}`);
      setTicket(r.data?.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();

    socketService.connect();
    const handleReply = (data: any) => {
      if (String(data.ticketId) === String(id)) {
        load();
      }
    };

    socketService.on('ticket_reply', handleReply);
    return () => {
      socketService.off('ticket_reply', handleReply);
    };
  }, [id, load]);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
    }
  };

  const sendReply = async () => {
    if ((!message.trim() && !selectedImage) || sending) return;
    setSending(true);
    try {
      let imageUrl = null;
      if (selectedImage) {
        const formData = new FormData();
        formData.append('file', {
          uri: selectedImage.uri,
          name: 'upload.jpg',
          type: 'image/jpeg'
        } as any);
        formData.append('purpose', 'ticket');

        const upRes = await apiClient.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        imageUrl = upRes.data?.data?.url;
      }

      const payload: any = { message: message.trim() || ' ' };
      if (imageUrl) payload.imageUrl = imageUrl;

      await apiClient.post(`/support/${id}/reply`, payload);
      setMessage('');
      setSelectedImage(null);
      load();
    } catch {
    } finally {
      setSending(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.safe} edges={['top']}><View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}><BrutalInkLoader /></View></SafeAreaView>;
  if (!ticket) return <SafeAreaView style={styles.safe} edges={['top']}><Text style={{textAlign: 'center', marginTop: 50}}>{t('Not Found')}</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{ticket.subject}</Text>
          <Text style={styles.headerSub}>{t('Ticket')} #{String(ticket.id).slice(-6).toUpperCase()}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        automaticOffset
      >
        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {ticket.status === 'resolved' && (
            <View style={styles.resolvedBanner}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#137333" />
              <Text style={styles.resolvedText}>{t('This ticket has been resolved.')}</Text>
            </View>
          )}

          {ticket.messages?.map((msg: any, index: number) => {
            const isMe = msg.senderId === user?.id;
            const isFirst = index === 0;
            
            if (msg.isSystemMessage) {
              return (
                <View key={msg.id} style={styles.systemCard}>
                  <MaterialCommunityIcons name="robot-outline" size={16} color="#6B6B6B" />
                  <Text style={styles.systemCardText}>{msg.message}</Text>
                  <Text style={styles.systemTime}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              );
            }

            return (
              <View key={msg.id} style={[styles.ticketCard, isMe ? styles.ticketCardUser : styles.ticketCardAdmin]}>
                <View style={styles.ticketCardHeader}>
                  <View style={styles.ticketCardHeaderLeft}>
                    <View style={[styles.avatarBox, !isMe && { backgroundColor: '#FF5C00' }]}>
                      <Text style={{ fontFamily: 'Inter_700Bold', color: '#FFF', fontSize: 12 }}>
                        {isMe ? 'U' : 'S'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.ticketCardName}>{isMe ? t('You') : t('Support Team')}</Text>
                      <Text style={styles.ticketCardTime}>{new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric'})}, {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                  </View>
                  {isFirst && (
                    <View style={styles.originalBadge}>
                      <Text style={styles.originalBadgeText}>{t('Original Query')}</Text>
                    </View>
                  )}
                </View>
                
                {msg.imageUrl && (
                  <Image source={{ uri: msg.imageUrl }} style={styles.ticketImage} contentFit="cover" />
                )}
                {msg.message && msg.message.trim() !== '' && (
                  <Text style={styles.ticketCardBody}>{msg.message}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>

        {ticket.status !== 'resolved' && (
          <View style={styles.inputArea}>
            {selectedImage && (
              <View style={{ position: 'relative', width: 60, height: 60, marginBottom: 12 }}>
                <Image source={{ uri: selectedImage.uri }} style={{ width: 60, height: 60, borderRadius: 8 }} contentFit="cover" />
                <Pressable onPress={() => setSelectedImage(null)} style={{ position: 'absolute', top: -5, right: -5, backgroundColor: 'black', borderRadius: 12, padding: 2 }}>
                  <MaterialCommunityIcons name="close" size={14} color="white" />
                </Pressable>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Pressable onPress={pickImage} style={{ padding: 12, backgroundColor: '#F5F0E8', borderRadius: 12 }}>
                <MaterialCommunityIcons name="paperclip" size={24} color="#0D0D0D" />
              </Pressable>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={setMessage}
                placeholder={t('Add a reply to this ticket...')}
                placeholderTextColor="#9E9E9E"
                multiline
              />
            </View>
            <Pressable onPress={sendReply} style={[styles.sendBtn, (!message.trim() && !selectedImage) && { opacity: 0.5 }]}>
              {sending ? (
                <View style={{ transform: [{ scale: 0.8 }] }}><BrutalInkLoader /></View>
              ) : (
                <>
                  <Text style={{ fontFamily: 'Inter_700Bold', color: '#FFF', fontSize: 16 }}>{t('Submit Reply')}</Text>
                  <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
                </>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EAE2D6' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#0D0D0D' },
  headerSub: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#9E9E9E' },

  chatArea: { flex: 1 },
  chatContent: { padding: 16, gap: 16 },

  resolvedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E6F4EA', padding: 12, borderRadius: 12, marginBottom: 8 },
  resolvedText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#137333' },

  systemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE8DC', padding: 12, borderRadius: 8, gap: 8 },
  systemCardText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, color: '#4A4A4A' },
  systemTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A' },

  ticketCard: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#EAE2D6', backgroundColor: '#FFFFFF' },
  ticketCardUser: { backgroundColor: '#FFFFFF' },
  ticketCardAdmin: { backgroundColor: '#FFF9F5', borderColor: '#FFD3B6' },
  ticketCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  ticketCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' },
  ticketCardName: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#0D0D0D' },
  ticketCardTime: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#8A8A8A', marginTop: 2 },
  originalBadge: { backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  originalBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#6B6B6B' },
  ticketCardBody: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#2C2C2C', lineHeight: 22 },
  ticketImage: { width: '100%', height: 200, borderRadius: 8, marginBottom: 12 },

  inputArea: { padding: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EAE2D6' },
  input: { flex: 1, minHeight: 48, maxHeight: 120, backgroundColor: '#F9F9F9', borderRadius: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', borderWidth: 1, borderColor: '#EAE2D6' },
  sendBtn: { width: '100%', height: 48, borderRadius: 12, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center', marginTop: 12, flexDirection: 'row', gap: 8 }
});
