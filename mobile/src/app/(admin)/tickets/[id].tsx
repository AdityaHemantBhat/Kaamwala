import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { socketService } from '../../../api/socket';
import { useT } from '../../../utils/i18n';

export default function AdminTicketDetail() {
  const t = useT();
  const { id } = useLocalSearchParams();
  const router = useRouter();
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
      load(); // refresh messages
    } catch {
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async () => {
    try {
      await apiClient.patch(`/support/${id}/status`, { status: 'resolved' });
      load();
    } catch {
    }
  };

  if (loading) return <SafeAreaView style={styles.safe} edges={['top']}><View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}><BrutalInkLoader /></View></SafeAreaView>;
  if (!ticket) return <SafeAreaView style={styles.safe} edges={['top']}><Text style={{textAlign: 'center', marginTop: 50}}>{t('Not Found')}</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{ticket.subject}</Text>
          <Text style={styles.headerSub}>{t('Ticket')} #{String(ticket.id).slice(-6).toUpperCase()}</Text>
        </View>
        <Pressable
          style={styles.auditBtn}
          onPress={() => router.push(`/(admin)/audit/${ticket.userId}`)}
        >
          <MaterialCommunityIcons name="history" size={20} color="#1A73E8" />
          <Text style={styles.auditBtnText}>{t('Audit')}</Text>
        </Pressable>
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
              <Text style={styles.resolvedText}>{t('This ticket is resolved.')}</Text>
            </View>
          )}

          {ticket.messages?.map((msg: any) => {
            const isMe = msg.senderId === user?.id || msg.isFromAdmin;
            return (
              <View key={msg.id} style={[styles.msgWrapper, isMe ? styles.msgWrapperRight : styles.msgWrapperLeft]}>
                {!isMe && (
                  <View style={styles.avatarBox}>
                    <Text style={styles.avatarText}>{msg.sender?.name?.[0] || 'U'}</Text>
                  </View>
                )}
                <View style={[styles.msgBubble, isMe ? styles.msgBubbleRight : styles.msgBubbleLeft]}>
                  {msg.isSystemMessage ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <MaterialCommunityIcons name="robot-outline" size={14} color={isMe ? '#FFFFFF' : '#8A8A8A'} />
                      <Text style={[styles.msgSender, { color: isMe ? '#E8F0FE' : '#8A8A8A' }]}>{t('System')}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.msgSender, { color: isMe ? '#E8F0FE' : '#8A8A8A' }]}>{msg.sender?.name || t('Admin')}</Text>
                  )}
                  
                  {msg.imageUrl && (
                    <Image source={{ uri: msg.imageUrl }} style={{ width: 200, height: 200, borderRadius: 8, marginBottom: 8 }} contentFit="cover" />
                  )}
                  {msg.message && msg.message.trim() !== '' && (
                    <Text style={[styles.msgText, { color: isMe ? '#FFFFFF' : '#202124' }]}>{msg.message}</Text>
                  )}
                  <Text style={[styles.msgTime, { color: isMe ? '#E8F0FE' : '#8A8A8A' }]}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {ticket.status !== 'resolved' && (
          <View style={styles.inputArea}>
            <View style={{ flexDirection: 'column', flex: 1 }}>
              {selectedImage && (
                <View style={{ position: 'relative', width: 60, height: 60, marginBottom: 8, marginLeft: 8 }}>
                  <Image source={{ uri: selectedImage.uri }} style={{ width: 60, height: 60, borderRadius: 8 }} contentFit="cover" />
                  <Pressable onPress={() => setSelectedImage(null)} style={{ position: 'absolute', top: -5, right: -5, backgroundColor: 'black', borderRadius: 12, padding: 2 }}>
                    <MaterialCommunityIcons name="close" size={14} color="white" />
                  </Pressable>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable onPress={closeTicket} style={[styles.closeBtn, { marginRight: 8 }]}>
                  <MaterialCommunityIcons name="check" size={22} color="#137333" />
                </Pressable>
                <Pressable onPress={pickImage} style={{ padding: 8, marginRight: 4 }}>
                  <MaterialCommunityIcons name="paperclip" size={24} color="#8A8A8A" />
                </Pressable>
                <TextInput
                  style={styles.input}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t('Type a reply...')}
                  placeholderTextColor="#8A8A8A"
                  multiline
                />
              </View>
            </View>
            <Pressable onPress={sendReply} style={[styles.sendBtn, (!message.trim() && !selectedImage) && { opacity: 0.5 }]}>
              {sending ? (
                <View style={{ transform: [{ scale: 0.5 }] }}><BrutalInkLoader /></View>
              ) : (
                <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
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
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#202124' },
  headerSub: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },
  auditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F0FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  auditBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#1A73E8' },

  chatArea: { flex: 1 },
  chatContent: { padding: 16, gap: 16 },

  resolvedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E6F4EA', padding: 12, borderRadius: 12, marginBottom: 8 },
  resolvedText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#137333' },

  msgWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  msgWrapperLeft: { justifyContent: 'flex-start' },
  msgWrapperRight: { justifyContent: 'flex-end' },
  avatarBox: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFFFFF' },
  msgBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  msgBubbleLeft: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  msgBubbleRight: { backgroundColor: '#1A73E8', borderBottomRightRadius: 4 },
  msgSender: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginBottom: 4 },
  msgText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  msgTime: { fontFamily: 'Inter_400Regular', fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },

  inputArea: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EAE2D6', gap: 8 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E6F4EA', justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 100, backgroundColor: '#F5F0E8', borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#202124' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center' }
});
