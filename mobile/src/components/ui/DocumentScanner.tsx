import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../utils/i18n';

const { width, height } = Dimensions.get('window');

interface DocumentScannerProps {
  side: 'FRONT' | 'BACK' | 'SELFIE';
  onCapture: (uri: string) => void;
  onCancel: () => void;
}

export function DocumentScanner({ side, onCapture, onCancel }: DocumentScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<any>(null);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const t = useT();

  if (!permission) {
    return <View style={styles.container}><ActivityIndicator color="#FF5C00" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FFFFFF' }]}>
        <MaterialCommunityIcons name="camera-off" size={48} color="#C8C0B0" />
        <Text style={styles.permissionText}>{t('We need your permission to show the camera')}</Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>{t('Grant Permission')}</Text>
        </Pressable>
        <Pressable style={{ marginTop: 24 }} onPress={onCancel}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#6B6B6B' }}>{t('Cancel')}</Text>
        </Pressable>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
      });
      if (photo?.uri) {
        setCapturedPhoto(photo);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
  };

  const handleConfirm = async () => {
    if (capturedPhoto) {
      setIsCapturing(true);
      try {
        const imageRatio = capturedPhoto.width / capturedPhoto.height;
        const screenRatio = width / height;
        
        let scale;
        if (imageRatio > screenRatio) {
          scale = capturedPhoto.height / height;
        } else {
          scale = capturedPhoto.width / width;
        }
        
        const boxWidth = width * 0.85;
        const boxHeight = side === 'SELFIE' ? boxWidth : boxWidth * 0.63;
        
        const cropW = Math.round(boxWidth * scale);
        const cropH = Math.round(boxHeight * scale);
        const cropX = Math.round((capturedPhoto.width - cropW) / 2);
        const cropY = Math.round((capturedPhoto.height - cropH) / 2);
        
        const manipResult = await ImageManipulator.manipulateAsync(
          capturedPhoto.uri,
          [{ crop: { originX: Math.max(0, cropX), originY: Math.max(0, cropY), width: Math.min(cropW, capturedPhoto.width), height: Math.min(cropH, capturedPhoto.height) } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        
        onCapture(manipResult.uri);
      } catch (e) {
        console.error('Crop error', e);
        onCapture(capturedPhoto.uri);
      } finally {
        setIsCapturing(false);
      }
    }
  };

  const isSelfie = side === 'SELFIE';

  if (capturedPhoto) {
    const previewUri = capturedPhoto.uri;
    const boxWidth = width * 0.85;
    const boxHeight = isSelfie ? boxWidth : boxWidth * 0.63;

    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        
        {/* Visually cropped image container */}
        <View style={{ flex: 1 }}>
          <View style={[
            styles.guideBox, 
            isSelfie && styles.guideBoxCircle, 
            { 
              overflow: 'hidden', 
              backgroundColor: '#111',
              position: 'absolute',
              top: (height - boxHeight) / 2,
              left: (width - boxWidth) / 2
            }
          ]}>
            <Image 
              source={{ uri: previewUri }} 
              style={{ 
                width: width, 
                height: height, 
                position: 'absolute', 
                top: -(height - boxHeight) / 2, 
                left: -(width - boxWidth) / 2 
              }} 
              resizeMode="cover" 
            />
            
            {/* Corners on top of the cropped image */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        {/* Preview Overlay Controls */}
        <View style={[styles.previewOverlay, { position: 'absolute', top: 0, left: 0, width, height, pointerEvents: 'box-none' }]}>
          <View style={[styles.header, { position: 'absolute', top: 0, width: '100%', paddingTop: Math.max(insets.top, 24) }]}>
            <Text style={styles.headerText}>{t('Review Photo')}</Text>
          </View>
          
          <View style={[styles.bottomControls, { position: 'absolute', bottom: 0, width: '100%', paddingBottom: Math.max(insets.bottom + 32, 56) }]}>
            <Pressable style={styles.retakeBtn} onPress={handleRetake}>
              <MaterialCommunityIcons name="refresh" size={24} color="#0D0D0D" />
              <Text style={styles.retakeBtnText}>{t('Retake')}</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
              <MaterialCommunityIcons name="check" size={24} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>{t('Looks Good')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const boxWidth = width * 0.85;
  const boxHeight = isSelfie ? boxWidth : boxWidth * 0.63;

  return (
    <View style={styles.container}>
      <CameraView
        style={{ position: 'absolute', top: 0, left: 0, width, height }}
        facing={isSelfie ? 'front' : 'back'}
        ref={cameraRef}
        animateShutter={false}
      />
      <View style={[styles.overlayContainer, { position: 'absolute', top: 0, left: 0, width, height, pointerEvents: 'box-none' }]}>

        <View style={[styles.header, { position: 'absolute', top: 0, width: '100%', paddingTop: Math.max(insets.top, 24) }]}>
          <Pressable style={styles.closeBtn} onPress={onCancel}>
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerText}>
            {isSelfie ? t('Take a Selfie') : t(`Scan ${side === 'FRONT' ? 'Front' : 'Back'} of ID`)}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.guideWrapper, { position: 'absolute', top: (height - boxHeight) / 2, left: (width - boxWidth) / 2, width: boxWidth, height: boxHeight }]}>
          <View style={[styles.guideBox, isSelfie && styles.guideBoxCircle, { width: boxWidth, height: boxHeight }]}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <Text style={[styles.guideText, { position: 'absolute', bottom: -40, width: '100%', textAlign: 'center' }]}>
            {isSelfie ? t('Position your face in the circle') : t('Position ID card inside the frame')}
          </Text>
        </View>

        <View style={[styles.bottomControls, { position: 'absolute', bottom: 0, width: '100%', paddingBottom: Math.max(insets.bottom + 32, 56), justifyContent: 'center' }]}>
          <Pressable
            style={[styles.captureBtn, isCapturing && styles.captureBtnDisabled]}
            onPress={handleCapture}
            disabled={isCapturing}
          >
            <View style={styles.captureBtnInner} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#0D0D0D',
    textAlign: 'center',
    marginVertical: 16,
  },
  permissionBtn: {
    backgroundColor: '#FF5C00',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionBtnText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FFF',
  },
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'space-between',
  },
  previewOverlay: {
    ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  guideWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideBox: {
    width: width * 0.85,
    height: (width * 0.85) * 0.63, // ID card aspect ratio ~1.58
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 16,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  guideBoxCircle: {
    height: width * 0.85,
    borderRadius: (width * 0.85) / 2,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#FFFFFF',
  },
  topLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  topRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },

  guideText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 24,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnDisabled: {
    opacity: 0.5,
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
  },
  retakeBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#0D0D0D',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5C00',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
  },
  confirmBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});
