// Sala de cine de noche: fondo tinta cálido, papel crema para el texto y el dorado de las
// marquesinas para el «sí». El «no» es un coral apagado, nunca el rojo de error.
export const colors = {
  bg: '#121014',
  surface: '#1C1920',
  surface2: '#26222B',
  line: '#35303B',
  text: '#F4EFE8',
  muted: '#A69E96',
  faint: '#6F6870',
  gold: '#F2B544',
  goldInk: '#241A06',
  coral: '#E9725F',
  danger: '#F06A5E',
  ok: '#7CC99A',
} as const;

export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  body: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  bold: 'DMSans_700Bold',
} as const;

export const space = (n: number) => n * 4;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
