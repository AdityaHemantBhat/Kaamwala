import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { socketService } from '../../api/socket';

interface Broadcast {
  title: string;
  body: string;
  targetRole: 'ALL' | 'WORKER' | 'CUSTOMER' | 'ADMIN';
  createdAt: number;
  expiresAt: number;
}

/** True when the current user is part of the broadcast's audience. Shared by
 *  both the polled banner and the realtime event so the two paths agree. */
function isTargeted(broadcast: Broadcast, userRole?: string): boolean {
  return broadcast.targetRole === 'ALL' || broadcast.targetRole === userRole;
}

export function BroadcastMarquee() {
  const { user } = useAuthStore();
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const slideAnim = useState(new Animated.Value(-100))[0]; // Start offscreen top

  useEffect(() => {
    loadActiveBroadcast();

    // Listen for real-time broadcast events. The server already emits only to
    // the target role's sockets, but re-check the audience defensively so a
    // broadcast can never render for the wrong role.
    const handleBroadcast = (data: { title: string; body: string; targetRole?: Broadcast['targetRole']; expiresInHours?: number; timestamp: number }) => {
      const targetRole = data.targetRole ?? 'ALL';
      const newBroadcast: Broadcast = {
        title: data.title,
        body: data.body,
        targetRole,
        createdAt: data.timestamp,
        expiresAt: data.timestamp + (data.expiresInHours ?? 24) * 60 * 60 * 1000,
      };
      if (!isTargeted(newBroadcast, user?.role)) return;
      setBroadcast(newBroadcast);
      showMarquee();
    };

    socketService.on('broadcast_notification', handleBroadcast);

    return () => {
      socketService.off('broadcast_notification', handleBroadcast);
    };
  }, []);

  const loadActiveBroadcast = async () => {
    try {
      const res = await apiClient.get('/admin/super/active-broadcast');
      if (res.data?.data) {
        const bc = res.data.data;
        // Check if expired
        if (bc.expiresAt && bc.expiresAt < Date.now()) {
          setBroadcast(null);
          return;
        }
        // Check if user role matches target
        if (!isTargeted(bc, user?.role)) {
          setBroadcast(null);
          return;
        }
        setBroadcast(bc);
        showMarquee();
      }
    } catch (error) {
      // Not authorized or no broadcast
      setBroadcast(null);
    } finally {
      setLoading(false);
    }
  };

  const showMarquee = () => {
    setVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  const hideMarquee = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
    });
  };

  if (loading || !visible || !broadcast) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.innerContainer}>
        <MaterialCommunityIcons name="bullhorn" size={16} color="#FFF" style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>{broadcast.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{broadcast.body}</Text>
        </View>
        <Pressable onPress={hideMarquee} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={18} color="#FFF" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF5C00',
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  icon: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#FFF',
    marginBottom: 2,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  closeButton: {
    padding: 4,
  },
});