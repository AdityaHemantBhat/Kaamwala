export const Typography = {
  // All caps headers — the brutalist signature
  // Poppins Bold for display, ALL CAPS for any heading
  display:   { fontFamily: 'Poppins_800ExtraBold', letterSpacing: -1 },
  heading:   { fontFamily: 'Poppins_700Bold',      letterSpacing: 0.5, textTransform: 'uppercase' as const },
  subhead:   { fontFamily: 'Poppins_600SemiBold',  letterSpacing: 0.3 },
  label:     { fontFamily: 'Poppins_500Medium',    letterSpacing: 1.5, textTransform: 'uppercase' as const, fontSize: 11 },

  // Inter for readable body text — no caps
  body:      { fontFamily: 'Inter_400Regular' },
  bodyMed:   { fontFamily: 'Inter_500Medium' },
  bodyBold:  { fontFamily: 'Inter_700Bold' },

  // SpaceMono for numbers, prices, codes, OTPs
  mono:      { fontFamily: 'SpaceMono_400Regular' },
  monoBold:  { fontFamily: 'SpaceMono_700Bold' }, // Note: may fallback if only 400 is available

  // Font family strings for direct usage
  fontDisplay: 'Poppins_800ExtraBold',
  fontBody:    'Inter_400Regular',
  fontBodyMed: 'Inter_500Medium',
  fontSemi:    'Inter_600SemiBold',

  size: {
    xs:   10, 
    sm:   12, 
    base: 14, 
    md:   16,
    lg:   18, 
    xl:   22, 
    '2xl': 28, 
    '3xl': 36, 
    '4xl': 48
  }
};
