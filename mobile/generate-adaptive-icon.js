#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Generate properly sized Android Adaptive Icon
 * 
 * Requirements:
 * - Scale logo down 15-25% (20% = 80% scale)
 * - Add more transparent padding around logo
 * - Center logo perfectly for all launcher shapes
 * - Ensure no clipping on rounded masks
 */

async function generateAdaptiveIcon() {
  try {
    const assetsDir = path.join(__dirname, 'assets');
    const inputPath = path.join(assetsDir, 'android-icon-foreground.png');
    const outputPath = path.join(assetsDir, 'android-icon-foreground-resized.png');
    
    // Android Adaptive Icon canvas size
    const CANVAS_SIZE = 432; // xxxhdpi size (108dp * 4)
    
    // Logo should be 50% of canvas to fit all launcher masks
    const LOGO_SIZE = 216; // 50% of canvas (54dp * 4)
    
    // Center position
    const CENTER = CANVAS_SIZE / 2;
    const LOGO_POSITION = (CANVAS_SIZE - LOGO_SIZE) / 2; // 108
    
    console.log('\n🎨 Generating Android Adaptive Icon with Proper Padding\n');
    console.log('📐 Specifications:');
    console.log('   Canvas: ' + CANVAS_SIZE + 'x' + CANVAS_SIZE + 'px (108dp at xxxhdpi)');
    console.log('   Logo size: ' + LOGO_SIZE + 'x' + LOGO_SIZE + 'px (54dp safe area)');
    console.log('   Padding: ' + LOGO_POSITION + 'px all sides (27dp)');
    console.log('   Center: (' + CENTER + ', ' + CENTER + ')\n');
    
    // Read the original foreground image
    console.log('📖 Reading source image...');
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    console.log('   Source size: ' + metadata.width + 'x' + metadata.height + 'px');
    console.log('   Format: ' + metadata.format);
    console.log('   Has alpha: ' + metadata.hasAlpha + '\n');
    
    // Calculate scaling factor
    // We want the logo to be 216px at most, so we scale down the original
    const scale = LOGO_SIZE / Math.max(metadata.width, metadata.height);
    const scaledSize = Math.round(Math.max(metadata.width, metadata.height) * scale);
    
    console.log('📏 Scaling:');
    console.log('   Scale factor: ' + scale.toFixed(2) + 'x (' + Math.round(scale * 100) + '%)');
    console.log('   Scaled logo size: ' + scaledSize + 'px\n');
    
    // Step 1: Scale down the logo to fit in safe zone
    const scaledImage = await sharp(inputPath)
      .resize(scaledSize, scaledSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();
    
    // Step 2: Create canvas with padding and center the logo
    const padding = (CANVAS_SIZE - scaledSize) / 2;
    
    console.log('🎯 Creating padded canvas:');
    console.log('   Padding: ' + Math.round(padding) + 'px');
    console.log('   Logo position: (' + Math.round(padding) + ', ' + Math.round(padding) + ')\n');
    
    const finalImage = await sharp({
      create: {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([{
      input: scaledImage,
      top: Math.round(padding),
      left: Math.round(padding)
    }])
    .png()
    .toFile(outputPath);
    
    console.log('✅ Icon generated successfully!\n');
    console.log('   Output: ' + outputPath);
    console.log('   Size: ' + (finalImage.size / 1024).toFixed(2) + ' KB\n');
    
    // Now replace the original
    console.log('💾 Replacing original foreground image...');
    fs.copyFileSync(outputPath, inputPath);
    fs.unlinkSync(outputPath);
    console.log('   ✅ Updated: ' + inputPath + '\n');
    
    console.log('✨ Next steps:\n');
    console.log('   1. Run: npx expo prebuild --clean');
    console.log('   2. Run: cd android && ./gradlew clean assembleRelease\n');
    
    console.log('🎉 Expected Result:');
    console.log('   ✓ Icon properly centered');
    console.log('   ✓ Logo not clipped on rounded masks');
    console.log('   ✓ Premium appearance on all launchers');
    console.log('   ✓ Proper spacing on all devices\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

generateAdaptiveIcon();
