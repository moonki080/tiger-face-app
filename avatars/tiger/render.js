const DEFAULT_MASK = Object.freeze({
  featureColor: "#5d2f11",
  noseColor: "#5d2f11",
  eyeWhite: "rgba(255, 255, 255, 0.92)",
  cheekColor: "rgba(255, 137, 111, 0.28)",
  mouthColor: "#5a180b",
  tongueColor: "#ff8d93",
  eyeY: -0.12,
  mouthY: 0.19,
  noseY: 0.08,
  eyeSpacing: 0.22,
  eyeWidth: 0.085,
  eyeHeight: 0.115,
  stickerWidthFactor: 1.52,
  stickerHeightFactor: 1.56,
  anchorY: 0.54,
  whiskers: false
});

export function renderAvatar(ctx, scene) {
  const {
    width,
    height,
    timeMs,
    faceDetected,
    metrics,
    motion,
    expressions,
    mask
  } = scene;
  const activeMask = {
    ...DEFAULT_MASK,
    ...(mask || {})
  };
  const anchorX = Number.isFinite(motion?.x) ? motion.x : width * 0.5;
  const anchorY = Number.isFinite(motion?.y) ? motion.y : height * 0.5;
  const faceSize = Number.isFinite(motion?.size)
    ? motion.size
    : clamp(Math.min(width, height) * 0.28, 90, 220);
  const idleFloatY = faceDetected ? 0 : Math.sin(timeMs / 620) * faceSize * 0.03;
  const pulse = 1 + Math.sin(timeMs / 300) * (expressions.happy ? 0.018 : 0.01);
  const tiltDegrees = faceDetected
    ? clamp(metrics.headTiltSigned, -18, 18) * 0.85
    : Math.sin(timeMs / 920) * 4;
  const mouthOpen = faceDetected ? clamp(metrics.mouthOpen, 0, 1) : 0.08;
  const blinkClosed =
    expressions.blink || (!faceDetected && Math.sin(timeMs / 190) > 0.97);
  const centerX = anchorX;
  const centerY = anchorY + idleFloatY;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(centerX, centerY);
  ctx.rotate((tiltDegrees * Math.PI) / 180);

  drawMaskShadow(ctx, faceSize);
  drawMaskImage(ctx, faceSize * pulse, activeMask);
  drawMaskFace(ctx, faceSize * pulse, activeMask, {
    blinkClosed,
    mouthOpen,
    happy: expressions.happy,
    tilt: expressions.tilt
  });

  ctx.restore();
}

function drawMaskShadow(ctx, faceSize) {
  ctx.save();
  ctx.fillStyle = "rgba(18, 11, 8, 0.14)";
  ctx.beginPath();
  ctx.ellipse(0, faceSize * 0.42, faceSize * 0.42, faceSize * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMaskImage(ctx, faceSize, mask) {
  const stickerWidth = faceSize * mask.stickerWidthFactor;
  const stickerHeight = faceSize * mask.stickerHeightFactor;
  const drawX = -stickerWidth / 2;
  const drawY = -stickerHeight * mask.anchorY;

  if (mask.image?.complete && mask.image.naturalWidth > 0) {
    ctx.drawImage(mask.image, drawX, drawY, stickerWidth, stickerHeight);
    return;
  }

  ctx.save();
  ctx.fillStyle = "#ffc45d";
  ctx.beginPath();
  ctx.arc(0, 0, faceSize * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMaskFace(ctx, faceSize, mask, expressionState) {
  drawCheeks(ctx, faceSize, mask, expressionState.happy);
  drawEyes(ctx, faceSize, mask, expressionState.blinkClosed);
  drawNose(ctx, faceSize, mask);
  drawMouth(ctx, faceSize, mask, expressionState.mouthOpen, expressionState.tilt);

  if (mask.whiskers) {
    drawWhiskers(ctx, faceSize, mask);
  }
}

function drawCheeks(ctx, faceSize, mask, happy) {
  ctx.save();
  ctx.fillStyle = enhanceAlpha(mask.cheekColor, happy ? 0.12 : 0);

  ctx.beginPath();
  ctx.ellipse(-faceSize * 0.24, faceSize * 0.1, faceSize * 0.12, faceSize * 0.075, -0.12, 0, Math.PI * 2);
  ctx.ellipse(faceSize * 0.24, faceSize * 0.1, faceSize * 0.12, faceSize * 0.075, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEyes(ctx, faceSize, mask, blinkClosed) {
  const eyeX = faceSize * mask.eyeSpacing;
  const eyeY = faceSize * mask.eyeY;
  const eyeWidth = faceSize * mask.eyeWidth;
  const eyeHeight = faceSize * mask.eyeHeight;

  ctx.save();
  ctx.strokeStyle = mask.featureColor;
  ctx.fillStyle = mask.featureColor;
  ctx.lineCap = "round";

  if (blinkClosed) {
    ctx.lineWidth = faceSize * 0.04;

    ctx.beginPath();
    ctx.moveTo(-eyeX - eyeWidth * 0.65, eyeY);
    ctx.quadraticCurveTo(-eyeX, eyeY + eyeHeight * 0.35, -eyeX + eyeWidth * 0.65, eyeY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(eyeX - eyeWidth * 0.65, eyeY);
    ctx.quadraticCurveTo(eyeX, eyeY + eyeHeight * 0.35, eyeX + eyeWidth * 0.65, eyeY);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(-eyeX, eyeY, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
    ctx.ellipse(eyeX, eyeY, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = mask.eyeWhite;
    ctx.beginPath();
    ctx.ellipse(-eyeX + eyeWidth * 0.28, eyeY - eyeHeight * 0.35, eyeWidth * 0.2, eyeHeight * 0.24, -0.35, 0, Math.PI * 2);
    ctx.ellipse(eyeX + eyeWidth * 0.28, eyeY - eyeHeight * 0.35, eyeWidth * 0.2, eyeHeight * 0.24, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawNose(ctx, faceSize, mask) {
  const noseY = faceSize * mask.noseY;

  ctx.save();
  ctx.fillStyle = mask.noseColor;
  ctx.beginPath();
  ctx.ellipse(0, noseY, faceSize * 0.07, faceSize * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMouth(ctx, faceSize, mask, mouthOpen, tilt) {
  const mouthY = faceSize * mask.mouthY;

  ctx.save();
  ctx.translate(0, mouthY);
  ctx.strokeStyle = mask.featureColor;
  ctx.lineWidth = faceSize * 0.03;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, -faceSize * 0.02);
  ctx.lineTo(0, faceSize * 0.06);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, faceSize * 0.06);
  ctx.quadraticCurveTo(-faceSize * 0.1, faceSize * 0.12, -faceSize * 0.16, faceSize * 0.08);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, faceSize * 0.06);
  ctx.quadraticCurveTo(faceSize * 0.1, faceSize * 0.12, faceSize * 0.16, faceSize * 0.08);
  ctx.stroke();

  if (mouthOpen > 0.18) {
    const openHeight = faceSize * (0.06 + mouthOpen * 0.12);

    ctx.fillStyle = mask.mouthColor;
    ctx.beginPath();
    ctx.ellipse(0, faceSize * 0.12, faceSize * 0.13, openHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = mask.tongueColor;
    ctx.beginPath();
    ctx.ellipse(
      0,
      faceSize * 0.17,
      faceSize * 0.08,
      Math.max(faceSize * 0.04, openHeight * 0.45),
      tilt ? 0.14 : 0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.restore();
}

function drawWhiskers(ctx, faceSize, mask) {
  const whiskerY = faceSize * 0.16;
  const startX = faceSize * 0.13;

  ctx.save();
  ctx.strokeStyle = mask.featureColor;
  ctx.lineWidth = faceSize * 0.018;
  ctx.lineCap = "round";

  [-1, 1].forEach((side) => {
    [0.02, -0.03].forEach((offsetY, index) => {
      ctx.beginPath();
      ctx.moveTo(startX * side, whiskerY + faceSize * offsetY);
      ctx.lineTo((startX + faceSize * (0.16 + index * 0.02)) * side, whiskerY + faceSize * (offsetY - 0.03));
      ctx.stroke();
    });
  });

  ctx.restore();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function enhanceAlpha(color, amount) {
  const match = color.match(/rgba\(([^)]+)\)/);
  if (!match) {
    return color;
  }

  const parts = match[1].split(",").map((part) => part.trim());
  const alpha = Number(parts[3] || "1");
  const nextAlpha = clamp(alpha + amount, 0, 1);

  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${nextAlpha})`;
}

export default renderAvatar;
