// Mazo de cartas para deslizar. Todo el arrastre corre en el hilo de UI (Reanimated +
// Gesture Handler): React solo se entera cuando una carta sale (onSwipe).
import * as Haptics from 'expo-haptics';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Card } from '@/lib/types';
import { colors, fonts, radius } from '@/theme';
import { MovieCard } from './MovieCard';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export interface DeckHandle {
  /** Desliza la carta de arriba como si fuera con el dedo (botones ✕ / ♥). */
  swipe(liked: boolean): void;
}

interface Props {
  cards: Card[];
  onSwipe(card: Card, liked: boolean): void;
}

export const SwipeDeck = forwardRef<DeckHandle, Props>(function SwipeDeck({ cards, onSwipe }, ref) {
  // Cuánto ha salido la carta de arriba (0..1): hace crecer la de detrás.
  const progress = useSharedValue(0);
  const [top, next] = cards;
  const topRef = useRef<DeckHandle | null>(null);

  useImperativeHandle(ref, () => ({ swipe: (liked) => topRef.current?.swipe(liked) }));

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* La de detrás primero (queda debajo). Las claves hacen que la de detrás pase a ser la de arriba sin remontarse. */}
      {[next, top]
        .filter((c): c is Card => !!c)
        .map((c) => (
          <SwipeCard
            key={c.id}
            ref={c === top ? topRef : undefined}
            card={c}
            isTop={c === top}
            progress={progress}
            onGone={(liked) => {
              onSwipe(c, liked);
            }}
          />
        ))}
    </View>
  );
});

const SwipeCard = forwardRef<
  DeckHandle,
  { card: Card; isTop: boolean; progress: SharedValue<number>; onGone(liked: boolean): void }
>(function SwipeCard({ card, isTop, progress, onGone }, ref) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const gone = useSharedValue(false);
  const [details, setDetails] = useState(false);
  const threshold = width * 0.28;
  const offscreen = width * 1.4;

  // Al pasar a ser la de arriba, la siguiente empieza desde atrás (queda tapada, no se ve el salto).
  useEffect(() => {
    if (isTop) progress.set(0);
  }, [isTop, progress]);

  const done = (liked: boolean) => onGone(liked);
  const haptic = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  /** `fromUI`: llamada desde el gesto (hilo de UI) o desde un botón (hilo de React). */
  function fling(liked: boolean, velocity = 0, fromUI = false) {
    'worklet';
    if (gone.get()) return;
    gone.set(true);
    if (fromUI) scheduleOnRN(haptic);
    else haptic();
    progress.set(withTiming(1, { duration: 200, easing: EASE_OUT }));
    const target = liked ? offscreen : -offscreen;
    const cb = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(done, liked);
    };
    if (reduced) x.set(withTiming(target, { duration: 160, easing: EASE_OUT }, cb));
    else x.set(withSpring(target, { duration: 350, dampingRatio: 1, velocity, overshootClamping: true }, cb));
  }

  useImperativeHandle(ref, () => ({ swipe: (liked) => fling(liked) }));

  const pan = Gesture.Pan()
    .enabled(isTop)
    .activeOffsetX([-8, 8])
    .onUpdate((e) => {
      x.set(e.translationX);
      y.set(e.translationY * 0.4);
      progress.set(Math.min(1, Math.abs(e.translationX) / threshold));
    })
    .onEnd((e) => {
      // Basta con pasar el umbral o con un golpe rápido.
      const flick = Math.abs(e.velocityX) > 800 && Math.sign(e.velocityX) === Math.sign(e.translationX);
      if (Math.abs(e.translationX) > threshold || flick) {
        fling(e.translationX > 0, e.velocityX, true);
      } else {
        x.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: e.velocityX }));
        y.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: e.velocityY }));
        progress.set(withSpring(0, { duration: 400, dampingRatio: 1 }));
      }
    });

  const tap = Gesture.Tap()
    .enabled(isTop)
    .maxDuration(250)
    .onEnd(() => scheduleOnRN(setDetails, !details));

  const cardStyle = useAnimatedStyle(() => {
    if (!isTop) {
      const s = interpolate(progress.get(), [0, 1], [0.94, 1]);
      return { transform: [{ translateY: interpolate(progress.get(), [0, 1], [14, 0]) }, { scale: s }] };
    }
    const rot = reduced ? 0 : interpolate(x.get(), [-width, width], [-12, 12]);
    return { transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${rot}deg` }] };
  });

  const yesStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [20, threshold], [0, 1], 'clamp') }));
  const noStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [-threshold, -20], [1, 0], 'clamp') }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        style={[StyleSheet.absoluteFill, cardStyle]}
        accessible={isTop}
        accessibilityLabel={`${card.title}${card.year ? `, ${card.year}` : ''}`}
        accessibilityHint="Desliza a la derecha si te apetece, a la izquierda si no"
        accessibilityActions={[
          { name: 'activate', label: 'Ver sinopsis' },
          { name: 'like', label: 'Me apetece' },
          { name: 'nope', label: 'No me apetece' },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate') setDetails((d) => !d);
          if (e.nativeEvent.actionName === 'like') fling(true);
          if (e.nativeEvent.actionName === 'nope') fling(false);
        }}
      >
        <MovieCard card={card} details={details} />
        {isTop ? (
          <>
            <Animated.View style={[st.stamp, st.yes, yesStyle]} pointerEvents="none">
              <Text style={[st.stampText, { color: colors.gold }]}>ME APETECE</Text>
            </Animated.View>
            <Animated.View style={[st.stamp, st.no, noStyle]} pointerEvents="none">
              <Text style={[st.stampText, { color: colors.coral }]}>PASO</Text>
            </Animated.View>
          </>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
});

const st = StyleSheet.create({
  stamp: {
    position: 'absolute',
    top: 56,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(18,16,20,0.55)',
  },
  yes: { left: 20, borderColor: colors.gold, transform: [{ rotate: '-12deg' }] },
  no: { right: 20, borderColor: colors.coral, transform: [{ rotate: '12deg' }] },
  stampText: { fontFamily: fonts.displayHeavy, fontSize: 26, letterSpacing: 1 },
});
