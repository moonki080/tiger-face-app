const ORANGE_MAIN = "#ff9837";
const ORANGE_LIGHT = "#ffc45d";
const ORANGE_DARK = "#d65d13";
const BROWN = "#6a3311";
const BROWN_SOFT = "#8c4518";
const CREAM = "#fff3d2";
const PINK = "#ff8d93";

export function renderAvatar(ctx, scene) {
  const {
    width,
    height,
    timeMs,
    faceDetected,
    isRecording,
    metrics,
    motion,
    expressions
  } = scene;
  const size = Math.min(width, height);
  const anchorX = Number.isFinite(motion?.x) ? motion.x : width * 0.5;
  const anchorY = Number.isFinite(motion?.y) ? motion.y : height * 0.5;
  const faceSize = Number.isFinite(motion?.size)
    ? motion.size
    : clamp(size * 0.28, 80, 200);
  const idleFloatY = faceDetected ? 0 : Math.sin(timeMs / 620) * size * 0.008;
  const pulse = 1 + Math.sin(timeMs / 340) * 0.01;
  // The signed head tilt keeps left/right leaning expressive, while the clamp
  // avoids extreme jumps when face tracking briefly wobbles.
  const tiltDegrees = faceDetected
    ? clamp(metrics.headTiltSigned, -18, 18) * 0.85
    : Math.sin(timeMs / 920) * 4;
  const mouthOpen = faceDetected ? clamp(metrics.mouthOpen, 0, 1) : 0.08;
  const blinkClosed =
    expressions.blink || (!faceDetected && Math.sin(timeMs / 190) > 0.97);

  // The renderer now behaves like a face sticker: the absolute nose anchor is
  // the source of truth, and only the face-sized tiger head is drawn.
  const centerX = anchorX;
  const centerY = anchorY + idleFloatY;
  const faceUnit = (faceSize / 1.1) * pulse;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(faceUnit, faceUnit);
  ctx.rotate((tiltDegrees * Math.PI) / 180);
  drawHead(ctx, {
    mouthOpen,
    blinkClosed,
    happy: expressions.happy,
    tilt: expressions.tilt
  });
  ctx.restore();
}

function drawGlow(ctx, centerX, centerY, size, isRecording, isHappy) {
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY - size * 0.08,
    size * 0.04,
    centerX,
    centerY - size * 0.08,
    size * 0.34
  );

  gradient.addColorStop(0, isRecording ? "rgba(255, 127, 104, 0.55)" : "rgba(255, 231, 151, 0.56)");
  gradient.addColorStop(0.45, isHappy ? "rgba(255, 178, 78, 0.24)" : "rgba(255, 178, 78, 0.18)");
  gradient.addColorStop(1, "rgba(255, 178, 78, 0)");

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY - size * 0.05, size * 0.32, size * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBody(ctx) {
  ctx.save();

  ctx.fillStyle = ORANGE_MAIN;
  ctx.beginPath();
  ctx.ellipse(0, 0.38, 0.52, 0.46, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.ellipse(0, 0.42, 0.28, 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ORANGE_DARK;
  ctx.beginPath();
  ctx.ellipse(-0.19, 0.76, 0.13, 0.11, -0.18, 0, Math.PI * 2);
  ctx.ellipse(0.19, 0.76, 0.13, 0.11, 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawArms(ctx, timeMs) {
  const armLift = Math.sin(timeMs / 420) * 0.03;

  ctx.save();
  ctx.strokeStyle = ORANGE_DARK;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.12;

  ctx.beginPath();
  ctx.moveTo(-0.38, 0.2);
  ctx.quadraticCurveTo(-0.64, 0.16 - armLift, -0.6, 0.44);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0.38, 0.2);
  ctx.quadraticCurveTo(0.64, 0.16 + armLift, 0.6, 0.44);
  ctx.stroke();

  ctx.restore();
}

function drawHead(ctx, { mouthOpen, blinkClosed, happy, tilt }) {
  ctx.save();
  ctx.translate(0, -0.08);

  drawEar(ctx, -0.37, -0.49, -0.3);
  drawEar(ctx, 0.37, -0.49, 0.3);

  ctx.fillStyle = ORANGE_MAIN;
  ctx.beginPath();
  ctx.arc(0, -0.02, 0.52, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.33, 0.27, 0, 0, Math.PI * 2);
  ctx.fill();

  drawStripes(ctx);
  drawCheeks(ctx, happy);
  drawEyes(ctx, blinkClosed);
  drawWhiskers(ctx);
  drawMouth(ctx, mouthOpen, tilt);

  ctx.restore();
}

function drawEar(ctx, x, y, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = ORANGE_MAIN;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.18, 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.ellipse(0, 0.03, 0.1, 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStripes(ctx) {
  ctx.save();
  ctx.fillStyle = BROWN;

  roundedStripe(ctx, 0, -0.47, 0.12, 0.2);
  roundedStripe(ctx, -0.28, -0.22, 0.1, 0.18, -0.28);
  roundedStripe(ctx, 0.28, -0.22, 0.1, 0.18, 0.28);

  ctx.restore();
}

function roundedStripe(ctx, x, y, width, height, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.roundRect(-width / 2, -height / 2, width, height, width / 2);
  ctx.fill();
  ctx.restore();
}

function drawCheeks(ctx, happy) {
  ctx.save();
  ctx.fillStyle = happy ? "rgba(255, 131, 120, 0.44)" : "rgba(255, 131, 120, 0.26)";

  ctx.beginPath();
  ctx.ellipse(-0.24, 0.12, 0.09, 0.06, -0.12, 0, Math.PI * 2);
  ctx.ellipse(0.24, 0.12, 0.09, 0.06, 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawEyes(ctx, blinkClosed) {
  ctx.save();
  ctx.strokeStyle = BROWN;
  ctx.fillStyle = BROWN_SOFT;
  ctx.lineCap = "round";

  if (blinkClosed) {
    ctx.lineWidth = 0.045;

    ctx.beginPath();
    ctx.moveTo(-0.2, -0.05);
    ctx.quadraticCurveTo(-0.12, 0.01, -0.04, -0.05);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0.04, -0.05);
    ctx.quadraticCurveTo(0.12, 0.01, 0.2, -0.05);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(-0.12, -0.03, 0.08, 0.11, 0, 0, Math.PI * 2);
    ctx.ellipse(0.12, -0.03, 0.08, 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(-0.1, -0.07, 0.018, 0.028, -0.25, 0, Math.PI * 2);
    ctx.ellipse(0.14, -0.07, 0.018, 0.028, -0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawWhiskers(ctx) {
  ctx.save();
  ctx.strokeStyle = BROWN_SOFT;
  ctx.lineWidth = 0.025;
  ctx.lineCap = "round";

  [-0.2, -0.14, 0.14, 0.2].forEach((offsetX) => {
    const direction = Math.sign(offsetX);
    const startX = direction * 0.14;

    ctx.beginPath();
    ctx.moveTo(startX, 0.16);
    ctx.lineTo(offsetX + direction * 0.11, 0.12);
    ctx.stroke();
  });

  ctx.restore();
}

function drawMouth(ctx, mouthOpen, tilt) {
  ctx.save();
  ctx.translate(0, 0.12);

  ctx.fillStyle = BROWN;
  ctx.beginPath();
  ctx.arc(0, -0.02, 0.05, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = BROWN;
  ctx.lineWidth = 0.03;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, 0.02);
  ctx.lineTo(0, 0.13);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0.13);
  ctx.quadraticCurveTo(-0.09, 0.18, -0.16, 0.14);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0.13);
  ctx.quadraticCurveTo(0.09, 0.18, 0.16, 0.14);
  ctx.stroke();

  if (mouthOpen > 0.18) {
    // A continuous open amount makes the tiger feel like it is truly mirroring
    // the user's face instead of only toggling between two mouth states.
    const openHeight = 0.08 + mouthOpen * 0.17;

    ctx.fillStyle = "#5a180b";
    ctx.beginPath();
    ctx.ellipse(0, 0.18, 0.11, openHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PINK;
    ctx.beginPath();
    ctx.ellipse(0, 0.24, 0.07, Math.max(0.04, openHeight * 0.45), tilt ? 0.12 : 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSparkles(ctx, centerX, centerY, size, timeMs, active) {
  if (!active) {
    return;
  }

  const sparklePoints = [
    { x: -0.22, y: -0.26, phase: 0 },
    { x: 0.28, y: -0.18, phase: 120 },
    { x: -0.3, y: 0.02, phase: 240 }
  ];

  ctx.save();
  ctx.fillStyle = "rgba(255, 248, 223, 0.92)";

  sparklePoints.forEach((point) => {
    const wave = 1 + Math.sin((timeMs + point.phase) / 240) * 0.25;
    const x = centerX + point.x * size;
    const y = centerY + point.y * size;
    const radius = size * 0.016 * wave;

    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.35, y - radius * 0.35);
    ctx.lineTo(x + radius, y);
    ctx.lineTo(x + radius * 0.35, y + radius * 0.35);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius * 0.35, y + radius * 0.35);
    ctx.lineTo(x - radius, y);
    ctx.lineTo(x - radius * 0.35, y - radius * 0.35);
    ctx.closePath();
    ctx.fill();
  });

  ctx.restore();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default renderAvatar;
