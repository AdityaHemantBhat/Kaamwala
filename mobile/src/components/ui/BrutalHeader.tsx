import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';

interface BrutalHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function BrutalHeader({ title, showBack = true, onBack }: BrutalHeaderProps) {
  const t = useT();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) onBack();
    else router.back();
  };

  return (
    <View style={[styles.header, { paddingTop: 8 }]}>
      {showBack && (
        <Pressable onPress={handleBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('Back')}>
          <MaterialCommunityIcons name="chevron-left" size={32} color={Colors.ink} />
        </Pressable>
      )}
      <Text style={[styles.title, !showBack && styles.titleNoBack]}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: Colors.ink,
    backgroundColor: Colors.cream,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    ...Typography.heading,
    fontSize: Typography.size.lg,
    color: Colors.ink,
  },
  titleNoBack: {
    marginLeft: 0,
  }
});
