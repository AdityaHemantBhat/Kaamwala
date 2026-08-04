import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, ScrollView, TouchableOpacity, Switch, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface BanData {
  banType: 'TEMPORARY' | 'PERMANENT';
  banDurationDays: string;
  banReason: string;
  banIp: boolean;
}

interface BanUserModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (banData: BanData) => Promise<void>;
  loading: boolean;
  userId: string;
  defaultBanType?: 'TEMPORARY' | 'PERMANENT';
}

export const BanUserModal: React.FC<BanUserModalProps> = ({
  visible,
  onClose,
  onConfirm,
  loading,
  userId,
  defaultBanType = 'TEMPORARY'
}) => {
  const [banType, setBanType] = useState<'TEMPORARY'|'PERMANENT'>(defaultBanType);
  const [banDurationDays, setBanDurationDays] = useState('7');
  const [banReason, setBanReason] = useState('');
  const [banIp, setBanIp] = useState(false);

  useEffect(() => {
    if (visible) {
      // Reset form when modal opens
      setBanType(defaultBanType);
      setBanDurationDays('7');
      setBanReason('');
      setBanIp(false);
    }
  }, [visible, defaultBanType]);

  const handleConfirm = async () => {
    await onConfirm({ banType, banDurationDays, banReason, banIp });
    resetForm();
  };

  const resetForm = () => {
    setBanType(defaultBanType);
    setBanDurationDays('7');
    setBanReason('');
    setBanIp(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView nestedScrollEnabled contentContainerStyle={styles.scrollContent}>
            <Text style={styles.modalTitle}>Ban User</Text>

            {/* Ban Type Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Ban Type</Text>
              <View style={styles.radioGroup}>
                <Pressable 
                  style={[styles.radioOption, banType === 'TEMPORARY' && styles.radioOptionActive]}
                  onPress={() => setBanType('TEMPORARY')}
                >
                  <View style={[styles.radioCircle, banType === 'TEMPORARY' && styles.radioCircleActive]}>
                    {banType === 'TEMPORARY' && (
                      <MaterialCommunityIcons name="check" size={12} color="#FFF" />
                    )}
                  </View>
                  <Text style={styles.radioLabel}>Temporary</Text>
                </Pressable>
                <Pressable 
                  style={[styles.radioOption, banType === 'PERMANENT' && styles.radioOptionActive]}
                  onPress={() => setBanType('PERMANENT')}
                >
                  <View style={[styles.radioCircle, banType === 'PERMANENT' && styles.radioCircleActive]}>
                    {banType === 'PERMANENT' && (
                      <MaterialCommunityIcons name="check" size={12} color="#FFF" />
                    )}
                  </View>
                  <Text style={styles.radioLabel}>Permanent</Text>
                </Pressable>
              </View>
            </View>

            {/* Duration (only for temporary) */}
            {banType === 'TEMPORARY' && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Duration (days)</Text>
                <TextInput
                  value={banDurationDays}
                  onChangeText={setBanDurationDays}
                  keyboardType="numeric"
                  style={styles.textInput}
                  placeholder="7"
                  placeholderTextColor="#9AA0A6"
                />
              </View>
            )}

            {/* Ban Reason */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Reason (Required)</Text>
              <TextInput
                value={banReason}
                onChangeText={setBanReason}
                multiline
                numberOfLines={4}
                style={[styles.textInput, { minHeight: 100, textAlignVertical: 'top' }]}
                placeholder="Reason for banning this user..."
                placeholderTextColor="#9AA0A6"
              />
            </View>

            {/* Ban IP Option */}
            <View style={styles.switchSection}>
              <View>
                <Text style={styles.sectionLabel}>Ban IP Address</Text>
                <Text style={styles.switchSubtitle}>Prevents new accounts from this IP</Text>
              </View>
              <Switch 
                value={banIp} 
                onValueChange={setBanIp}
                trackColor={{ false: '#E0E0E0', true: '#D32F2F' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              onPress={handleClose}
              disabled={loading}
              style={[styles.button, styles.cancelButton]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={loading || !banReason.trim()}
              style={[styles.button, styles.confirmButton, (!banReason.trim() || loading) && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Ban User</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    flexDirection: 'column',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 16,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: '#202124',
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#202124',
    marginBottom: 8,
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radioOptionActive: {
    paddingLeft: 4,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleActive: {
    borderColor: '#D32F2F',
    backgroundColor: '#D32F2F',
  },
  radioLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#202124',
    marginLeft: 8,
  },
  textInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 8,
    padding: 12,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#202124',
  },
  switchSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
  },
  switchSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#8A8A8A',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#EAE2D6',
  },
  cancelButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#202124',
  },
  confirmButton: {
    backgroundColor: '#D32F2F',
  },
  confirmButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
