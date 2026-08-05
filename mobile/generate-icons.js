#!/usr/bin/env node

/**
 * Icon generation script for Android adaptive icons
 * Creates properly scaled icons with safe zone padding
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, 'assets');

async function generateIcons() {
  try {
    console.log('Generating adaptive icon assets...\n');

    // For Android adaptive icons:
    // - Foreground: 108x108 dp with 18 dp safe zone (18 dp padding on all sides)
    // - Background: 108x108 dp solid color
    // - The safe zone is 72x72 dp in the center

    // Create a base icon from the existing logo
    // For the foreground, we'll create a centered logo with proper padding
    
    const logoSize = 1080; // High res base size
    const safezoneSize = 720; // 72 dp equivalent (1080 * 2/3)
    const padding = (logoSize - safezoneSize) / 2; // 180 px padding

    console.log('Creating android-icon-foreground.png (108x108 dp adaptive icon format)');
    
    // Create foreground: white background with centered, scaled logo
    // The logo will be scaled to fit the safe zone (72 dp)
    const logoScaled = 600; // Logo width within safe zone
    const logoPadding = (logoSize - logoScaled) / 2;

    // Create a 1080x1080 canvas with centered scaled logo
    await sharp({
      create: {
        width: logoSize,
        height: logoSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
      }
    })
      .png()
      .toFile(path.join(assetsDir, 'android-icon-foreground-temp.png'));

    // Read the original icon and composite it scaled onto the canvas
    const originalIcon = await sharp(path.join(assetsDir, 'icon.png'))
      .resize(logoScaled, logoScaled, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .toBuffer();

    await sharp(path.join(assetsDir, 'android-icon-foreground-temp.png'))
      .composite([
        {
          input: originalIcon,
          top: Math.round(logoPadding),
          left: Math.round(logoPadding)
        }
      ])
      .png()
      .toFile(path.join(assetsDir, 'android-icon-foreground.png'));

    fs.unlinkSync(path.join(assetsDir, 'android-icon-foreground-temp.png'));
    console.log('✓ android-icon-foreground.png created');

    console.log('\nCreating android-icon-background.png (solid color)');
    
    // Create background: solid color matching app theme
    await sharp({
      create: {
        width: logoSize,
        height: logoSize,
        channels: 3,
        background: { r: 245, g: 240, b: 232 } // #F5F0E8 from app.json
      }
    })
      .png()
      .toFile(path.join(assetsDir, 'android-icon-background.png'));

    console.log('✓ android-icon-background.png created');

    console.log('\nCreating android-icon-monochrome.png (for themed icons)');
    
    // Create monochrome version for themed icons
    await sharp(path.join(assetsDir, 'icon.png'))
      .resize(logoScaled, logoScaled, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .toBuffer()
      .then(logoBuffer => {
        return sharp({
          create: {
            width: logoSize,
            height: logoSize,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          }
        })
          .composite([
            {
              input: logoBuffer,
              top: Math.round(logoPadding),
              left: Math.round(logoPadding)
            }
          ])
          .greyscale()
          .png()
          .toFile(path.join(assetsDir, 'android-icon-monochrome.png'));
      });

    console.log('✓ android-icon-monochrome.png created');

    console.log('\n✅ All adaptive icon assets generated successfully!');
    console.log('\nIcon specifications:');
    console.log('  - Size: 1080x1080 px (108 dp at 10x scale)');
    console.log('  - Safe zone: 720x720 px (72 dp at 10x scale)');
    console.log('  - Logo scaled to fit safe zone with proper padding');
    console.log('  - Background: #F5F0E8 (matches app theme)');
    console.log('  - Monochrome support: enabled for themed icon variants');

  } catch (error) {
    console.error('Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
