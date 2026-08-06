const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateAndroidIcons() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  const outputDir = path.join(__dirname, '..', 'assets', 'android-icons');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Android Adaptive Icon specifications
  // For xxxhdpi (4.0x): 432x432 pixels canvas
  const CANVAS_SIZE = 432;
  const FOREGROUND_SIZE = 216; // 50% of canvas with padding
  const PADDING = (CANVAS_SIZE - FOREGROUND_SIZE) / 2; // 108px padding on each side

  try {
    // Read the main icon
    const mainIconPath = path.join(assetsDir, 'icon.png');
    
    // Create properly scaled foreground icon (centered, with padding)
    console.log('Generating Android Adaptive Icon foreground...');
    
    await sharp(mainIconPath)
      .resize(FOREGROUND_SIZE, FOREGROUND_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(path.join(outputDir, 'adaptive-foreground.png'));
    
    // Create monochrome version (same as foreground for now)
    console.log('Generating Android Adaptive Icon monochrome...');
    await sharp(mainIconPath)
      .resize(FOREGROUND_SIZE, FOREGROUND_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .greyscale()
      .toFile(path.join(outputDir, 'adaptive-monochrome.png'));
    
    // Create legacy icons for different densities
    const densities = [
      { name: 'mdpi', scale: 1, size: 48 },
      { name: 'hdpi', scale: 1.5, size: 72 },
      { name: 'xhdpi', scale: 2, size: 96 },
      { name: 'xxhdpi', scale: 3, size: 144 },
      { name: 'xxxhdpi', scale: 4, size: 192 }
    ];
    
    console.log('Generating legacy icons for different densities...');
    for (const density of densities) {
      await sharp(mainIconPath)
        .resize(density.size, density.size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toFile(path.join(outputDir, `legacy-${density.name}.png`));
    }
    
    console.log('✅ Android icons generated successfully!');
    console.log('Output directory:', outputDir);
    console.log('\nFiles generated:');
    console.log('- adaptive-foreground.png (216x216px)');
    console.log('- adaptive-monochrome.png (216x216px)');
    console.log('- legacy-mdpi.png (48x48px)');
    console.log('- legacy-hdpi.png (72x72px)');
    console.log('- legacy-xhdpi.png (96x96px)');
    console.log('- legacy-xxhdpi.png (144x144px)');
    console.log('- legacy-xxxhdpi.png (192x192px)');
    console.log('\nNote: Background should be solid color #F5F0E8 as configured in app.json');
    
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

// Run if called directly
if (require.main === module) {
  generateAndroidIcons();
}

module.exports = generateAndroidIcons;