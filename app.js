import {
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const TARGET_DETECTION_FPS = 18;
const COUNTDOWN_SECONDS = 3;
const RECORD_DURATION_MS = 10_000;
const MOTION_CONFIG = Object.freeze({
  positionLerp: 0.22,
  scaleLerp: 0.2,
  scaleBoost: 2.5,
  minScale: 0.6,
  maxScale: 2.2,
  idleScale: 1,
  idleSize: 140
});

const LANDMARK_INDEX = Object.freeze({
  noseTip: 1,
  upperLip: 13,
  lowerLip: 14,
  mouthLeft: 78,
  mouthRight: 308,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  leftEyeUpper: 159,
  leftEyeLower: 145,
  rightEyeUpper: 386,
  rightEyeLower: 374
});

const dom = {
  camera: document.getElementById("camera"),
  avatarCanvas: document.getElementById("avatarCanvas"),
  compositeCanvas: document.getElementById("compositeCanvas"),
  recordCanvas: document.getElementById("recordCanvas"),
  cameraStatus: document.getElementById("cameraStatus"),
  recordStatus: document.getElementById("recordStatus"),
  recordTimer: document.getElementById("recordTimer"),
  introCard: document.getElementById("introCard"),
  introTitle: document.getElementById("introTitle"),
  introCopy: document.getElementById("introCopy"),
  startCameraBtn: document.getElementById("startCameraBtn"),
  photoBtn: document.getElementById("photoBtn"),
  timerBtn: document.getElementById("timerBtn"),
  videoBtn: document.getElementById("videoBtn"),
  videoBtnIcon: document.getElementById("videoBtnIcon"),
  videoBtnLabel: document.getElementById("videoBtnLabel"),
  mouthPill: document.getElementById("mouthPill"),
  blinkPill: document.getElementById("blinkPill"),
  tiltPill: document.getElementById("tiltPill"),
  mouthValue: document.getElementById("mouthValue"),
  blinkValue: document.getElementById("blinkValue"),
  tiltValue: document.getElementById("tiltValue"),
  countdown: document.getElementById("countdown"),
  flashLayer: document.getElementById("flashLayer"),
  resultSheet: document.getElementById("resultSheet"),
  resultKicker: document.getElementById("resultKicker"),
  resultTitle: document.getElementById("resultTitle"),
  resultPreview: document.getElementById("resultPreview"),
  resultNote: document.getElementById("resultNote"),
  closeResultBtn: document.getElementById("closeResultBtn"),
  retakeBtn: document.getElementById("retakeBtn"),
  downloadLink: document.getElementById("downloadLink")
};

const state = {
  stream: null,
  faceLandmarker: null,
  avatarConfig: null,
  avatarRenderer: null,
  isStarting: false,
  isReady: false,
  countdownActive: false,
  faceDetected: false,
  lastDetectionAt: 0,
  animationFrameId: 0,
  activeObjectUrl: null,
  resultOpen: false,
  recording: null,
  motion: createMotionState(),
  metrics: createEmptyMetrics(),
  displayMetrics: createEmptyMetrics()
};

// App bootstrapping: wire events, register PWA support, and size the overlay
// canvas before the camera starts.
bindEvents();
registerServiceWorker();
resizeVisibleCanvas();
updateUi();

// Shared startup path: load avatar assets, MediaPipe, and camera only after the
// user taps once so iOS Safari stays happy with camera autoplay.
async function startExperience() {
  if (state.isStarting || state.isReady) {
    return;
  }

  state.isStarting = true;
  dom.startCameraBtn.disabled = true;
  setStatus("호랑이 카메라를 준비하는 중");
  dom.introTitle.textContent = "카메라 준비 중";
  dom.introCopy.textContent = "조금만 기다리면 바로 따라하기가 시작돼요.";

  try {
    await Promise.all([loadAvatar("tiger"), initializeFaceLandmarker(), startCamera()]);

    state.isReady = true;
    dom.introCard.classList.add("is-hidden");
    setStatus("표정을 따라하고 있어요");
    updateUi();
    startRenderLoop();
  } catch (error) {
    console.error(error);
    dom.introTitle.textContent = "카메라를 시작할 수 없어요";
    dom.introCopy.textContent =
      "카메라 권한을 허용한 뒤 다시 눌러 주세요. iPhone Safari에서는 홈 화면 앱이나 HTTPS 환경이 필요할 수 있어요.";
    dom.startCameraBtn.disabled = false;
    dom.startCameraBtn.textContent = "다시 시도";
    setStatus("카메라 권한이나 네트워크 상태를 확인해 주세요");
  } finally {
    state.isStarting = false;
    updateUi();
  }
}

async function loadAvatar(name) {
  if (state.avatarConfig && state.avatarRenderer) {
    return;
  }

  const configUrl = `./avatars/${name}/config.json`;
  const renderUrl = `./avatars/${name}/render.js`;

  const [configResponse, rendererModule] = await Promise.all([
    fetch(configUrl),
    import(renderUrl)
  ]);

  if (!configResponse.ok) {
    throw new Error(`Avatar config load failed: ${configResponse.status}`);
  }

  state.avatarConfig = await configResponse.json();
  state.avatarRenderer = rendererModule.renderAvatar || rendererModule.default;
}

async function initializeFaceLandmarker() {
  if (state.faceLandmarker) {
    return;
  }

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

  state.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_MODEL_URL
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API not supported");
  }

  if (state.stream) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  state.stream = stream;
  dom.camera.srcObject = stream;

  await dom.camera.play();
  await waitForVideoMetadata(dom.camera);
  resizeVisibleCanvas();
}

function startRenderLoop() {
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
  }

  const tick = (timeMs) => {
    state.animationFrameId = window.requestAnimationFrame(tick);
    resizeVisibleCanvas();
    maybeDetectFace(timeMs);
    updateAvatarMotion();
    updateDisplayMetrics();
    renderVisibleAvatar(timeMs);

    if (state.recording?.isActive) {
      updateRecordingTimer(timeMs);
      drawCompositeFrame({
        canvas: dom.recordCanvas,
        width: dom.recordCanvas.width,
        height: dom.recordCanvas.height
      });
    }
  };

  state.animationFrameId = window.requestAnimationFrame(tick);
}

function maybeDetectFace(timeMs) {
  if (
    !state.faceLandmarker ||
    dom.camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return;
  }

  const frameInterval = 1000 / TARGET_DETECTION_FPS;
  if (timeMs - state.lastDetectionAt < frameInterval) {
    return;
  }

  state.lastDetectionAt = timeMs;

  try {
    const result = state.faceLandmarker.detectForVideo(dom.camera, timeMs);
    applyFaceResult(result);
  } catch (error) {
    console.error("Face detection failed:", error);
    setStatus("표정을 읽는 중 잠시 숨을 고르고 있어요");
  }
}

function applyFaceResult(result) {
  const landmarks = result?.faceLandmarks?.[0];
  const blendshapes = result?.faceBlendshapes?.[0]?.categories || [];

  if (!landmarks) {
    state.faceDetected = false;
    resetMotionTargets();
    state.metrics = {
      ...state.metrics,
      mouthOpen: 0,
      eyeBlink: false,
      eyeBlinkScore: 0,
      headTilt: 0,
      headTiltSigned: 0,
      faceCenterX: 0.5,
      faceCenterY: 0.5,
      faceWidth: 0,
      expressions: evaluateExpressions(state.avatarConfig?.expressions, {
        mouthOpen: 0,
        eyeBlink: false,
        headTilt: 0,
        headTiltSigned: 0
      })
    };

    if (!state.recording?.isActive && !state.countdownActive) {
      setStatus("얼굴을 화면 가운데로 보여줘");
    }

    updateUi();
    return;
  }

  state.faceDetected = true;

  const blendshapeMap = Object.fromEntries(
    blendshapes.map((shape) => [shape.categoryName, shape.score])
  );

  // Blendshapes are the preferred signal, but each metric also has a landmark
  // fallback so the avatar still reacts even if a device omits some scores.
  const mouthOpen = calculateMouthOpen(blendshapeMap, landmarks);
  const eyeBlinkScore = calculateEyeBlinkScore(blendshapeMap, landmarks);
  const headTiltSigned = calculateHeadTilt(landmarks);
  const faceCenter = calculateFaceCenter(landmarks);
  const eyeDistance = calculateEyeDistance(landmarks);
  const metricsForRules = {
    mouthOpen,
    eyeBlink: eyeBlinkScore > 0.45,
    eyeBlinkScore,
    headTilt: Math.abs(headTiltSigned),
    headTiltSigned
  };

  updateMotionTargets(faceCenter, eyeDistance);

  state.metrics = {
    ...metricsForRules,
    faceCenterX: faceCenter.x,
    faceCenterY: faceCenter.y,
    faceWidth: eyeDistance,
    expressions: evaluateExpressions(state.avatarConfig?.expressions, metricsForRules)
  };

  if (!state.recording?.isActive && !state.countdownActive) {
    if (state.metrics.expressions.happy) {
      setStatus("활짝 웃는 중");
    } else if (state.metrics.expressions.blink) {
      setStatus("깜빡 성공");
    } else if (state.metrics.expressions.tilt) {
      setStatus("고개 기울이기 성공");
    } else {
      setStatus("표정을 따라하고 있어요");
    }
  }

  updateUi();
}

function renderVisibleAvatar(timeMs) {
  if (!state.avatarRenderer) {
    return;
  }

  const canvas = dom.avatarCanvas;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  state.avatarRenderer(ctx, {
    width: canvas.width,
    height: canvas.height,
    timeMs,
    isRecording: Boolean(state.recording?.isActive),
    faceDetected: state.faceDetected,
    metrics: state.displayMetrics,
    motion: resolveMotionForCanvas(canvas.width, canvas.height, "cover"),
    expressions: state.displayMetrics.expressions
  });
}

function updateAvatarMotion() {
  state.motion.currentNoseX = lerp(
    state.motion.currentNoseX,
    state.motion.targetNoseX,
    MOTION_CONFIG.positionLerp
  );
  state.motion.currentNoseY = lerp(
    state.motion.currentNoseY,
    state.motion.targetNoseY,
    MOTION_CONFIG.positionLerp
  );
  state.motion.currentScale = lerp(
    state.motion.currentScale,
    state.motion.targetScale,
    MOTION_CONFIG.scaleLerp
  );
}

function updateDisplayMetrics() {
  // Smooth sudden tracking jumps so the character feels playful instead of
  // twitchy on mobile browsers.
  state.displayMetrics.mouthOpen = lerp(
    state.displayMetrics.mouthOpen,
    state.metrics.mouthOpen,
    0.24
  );
  state.displayMetrics.eyeBlinkScore = lerp(
    state.displayMetrics.eyeBlinkScore,
    state.metrics.eyeBlinkScore,
    0.32
  );
  state.displayMetrics.eyeBlink = state.metrics.eyeBlink;
  state.displayMetrics.headTiltSigned = lerp(
    state.displayMetrics.headTiltSigned,
    state.metrics.headTiltSigned,
    0.22
  );
  state.displayMetrics.headTilt = Math.abs(state.displayMetrics.headTiltSigned);
  state.displayMetrics.faceCenterX = lerp(
    state.displayMetrics.faceCenterX,
    state.metrics.faceCenterX,
    0.2
  );
  state.displayMetrics.faceCenterY = lerp(
    state.displayMetrics.faceCenterY,
    state.metrics.faceCenterY,
    0.2
  );
  state.displayMetrics.faceWidth = lerp(
    state.displayMetrics.faceWidth,
    state.metrics.faceWidth,
    0.18
  );
  state.displayMetrics.expressions = state.metrics.expressions;
}

async function handlePhotoCapture() {
  if (!canUseCaptureControls()) {
    return;
  }

  closeResultSheet();
  triggerFlash();
  const dataUrl = takePhotoSnapshot();

  openResultSheet({
    type: "image",
    url: dataUrl,
    title: "사진이 완성됐어요",
    kicker: "찰칵!",
    note: "iPhone에서는 길게 누르거나 공유 메뉴로 저장해 주세요.",
    downloadName: `tiger-photo-${timestampLabel()}.png`
  });
}

async function handleTimedCapture() {
  if (!canUseCaptureControls()) {
    return;
  }

  closeResultSheet();
  await runCountdown(COUNTDOWN_SECONDS);
  triggerFlash();

  const dataUrl = takePhotoSnapshot();
  openResultSheet({
    type: "image",
    url: dataUrl,
    title: "타이머 사진이 완성됐어요",
    kicker: "3, 2, 1",
    note: "iPhone에서는 길게 누르거나 공유 메뉴로 저장해 주세요.",
    downloadName: `tiger-timer-${timestampLabel()}.png`
  });
}

async function handleVideoButton() {
  if (state.recording?.isActive) {
    stopRecording();
    return;
  }

  if (!canUseCaptureControls()) {
    return;
  }

  await startRecording();
}

async function startRecording() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof dom.recordCanvas.captureStream !== "function"
  ) {
    setStatus("이 기기에서는 영상 녹화를 지원하지 않아요");
    return;
  }

  closeResultSheet();
  prepareOffscreenCanvas(dom.recordCanvas);
  drawCompositeFrame({
    canvas: dom.recordCanvas,
    width: dom.recordCanvas.width,
    height: dom.recordCanvas.height
  });

  const stream = dom.recordCanvas.captureStream(TARGET_DETECTION_FPS);
  const mimeType = pickSupportedMimeType();
  let recorder = null;

  try {
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch (error) {
    console.error(error);
    setStatus("녹화를 시작할 수 없어요");
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  const chunks = [];

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  recorder.addEventListener("stop", () => {
    const finalType = recorder.mimeType || mimeType || "video/webm";
    const blob = new Blob(chunks, { type: finalType });

    stream.getTracks().forEach((track) => track.stop());
    finishRecording(blob, finalType);
  });

  recorder.start(250);

  state.recording = {
    recorder,
    isActive: true,
    startedAt: performance.now(),
    stopTimerId: window.setTimeout(() => stopRecording(), RECORD_DURATION_MS)
  };

  setStatus("녹화 중");
  updateUi();
}

function stopRecording() {
  if (!state.recording?.isActive) {
    return;
  }

  const { recorder, stopTimerId } = state.recording;
  window.clearTimeout(stopTimerId);
  state.recording.isActive = false;

  if (recorder.state !== "inactive") {
    recorder.stop();
  }

  setStatus("녹화를 마무리하는 중");
  updateUi();
}

function finishRecording(blob, mimeType) {
  state.recording = null;
  updateUi();

  if (!blob.size) {
    setStatus("녹화 파일을 만들지 못했어요");
    return;
  }

  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  const url = URL.createObjectURL(blob);

  openResultSheet({
    type: "video",
    url,
    title: "10초 영상이 완성됐어요",
    kicker: "녹화 끝!",
    note: "iPhone에서는 저장 버튼을 누른 뒤 공유 메뉴를 이용하면 더 잘 동작해요.",
    downloadName: `tiger-video-${timestampLabel()}.${extension}`
  });

  setStatus("영상 미리보기를 열었어요");
}

function takePhotoSnapshot() {
  prepareOffscreenCanvas(dom.compositeCanvas);

  drawCompositeFrame({
    canvas: dom.compositeCanvas,
    width: dom.compositeCanvas.width,
    height: dom.compositeCanvas.height
  });

  return dom.compositeCanvas.toDataURL("image/png");
}

// The saved image/video should look like the mirrored selfie preview, so both
// the camera frame and the avatar are drawn inside the same flipped context.
function drawCompositeFrame({ canvas, width, height }) {
  const ctx = canvas.getContext("2d");
  const timeMs = performance.now();

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(dom.camera, 0, 0, width, height);

  if (state.avatarRenderer) {
    state.avatarRenderer(ctx, {
      width,
      height,
      timeMs,
      isRecording: Boolean(state.recording?.isActive),
      faceDetected: state.faceDetected,
      metrics: state.displayMetrics,
      motion: resolveMotionForCanvas(width, height, "fill"),
      expressions: state.displayMetrics.expressions
    });
  }

  ctx.restore();
}

function openResultSheet({ type, url, title, kicker, note, downloadName }) {
  revokeActiveObjectUrl();

  if (type === "video" && url.startsWith("blob:")) {
    state.activeObjectUrl = url;
  }

  state.resultOpen = true;
  dom.resultPreview.innerHTML = "";
  dom.resultTitle.textContent = title;
  dom.resultKicker.textContent = kicker;
  dom.resultNote.textContent = note;
  dom.downloadLink.href = url;
  dom.downloadLink.download = downloadName;

  if (type === "image") {
    const image = document.createElement("img");
    image.src = url;
    image.alt = title;
    dom.resultPreview.append(image);
  } else {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;
    dom.resultPreview.append(video);
  }

  dom.resultSheet.classList.add("is-visible");
}

function closeResultSheet() {
  state.resultOpen = false;
  dom.resultSheet.classList.remove("is-visible");
  dom.resultPreview.innerHTML = "";
  revokeActiveObjectUrl();
}

async function runCountdown(seconds) {
  state.countdownActive = true;
  updateUi();

  for (let number = seconds; number >= 1; number -= 1) {
    dom.countdown.textContent = String(number);
    dom.countdown.classList.remove("is-visible");

    // Restart the CSS animation each second for the pop effect.
    void dom.countdown.offsetWidth;
    dom.countdown.classList.add("is-visible");

    setStatus(`찰칵 ${number}`);
    await wait(1000);
  }

  dom.countdown.classList.remove("is-visible");
  dom.countdown.textContent = "";
  state.countdownActive = false;
  updateUi();
}

function triggerFlash() {
  dom.flashLayer.classList.remove("is-flashing");
  void dom.flashLayer.offsetWidth;
  dom.flashLayer.classList.add("is-flashing");
}

function updateRecordingTimer(timeMs) {
  if (!state.recording?.startedAt) {
    dom.recordTimer.textContent = "10초";
    return;
  }

  const elapsed = timeMs - state.recording.startedAt;
  const secondsLeft = Math.max(0, Math.ceil((RECORD_DURATION_MS - elapsed) / 1000));
  dom.recordTimer.textContent = `${secondsLeft}초`;
}

function updateUi() {
  const busy = state.isStarting || state.countdownActive;
  const recording = Boolean(state.recording?.isActive);
  const controlsEnabled = state.isReady && !busy;

  dom.photoBtn.disabled = !controlsEnabled || recording;
  dom.timerBtn.disabled = !controlsEnabled || recording;
  dom.videoBtn.disabled = !state.isReady || state.isStarting || state.countdownActive;

  dom.videoBtnIcon.textContent = recording ? "⏹" : "🎥";
  dom.videoBtnLabel.textContent = recording ? "중지" : "10초 녹화";
  dom.recordStatus.hidden = !recording;

  dom.mouthPill.classList.toggle("is-active", state.metrics.expressions.happy);
  dom.blinkPill.classList.toggle("is-active", state.metrics.expressions.blink);
  dom.tiltPill.classList.toggle("is-active", state.metrics.expressions.tilt);

  dom.mouthValue.textContent = `${Math.round(state.metrics.mouthOpen * 100)}%`;
  dom.blinkValue.textContent = state.metrics.eyeBlink ? "깜빡!" : "또록";
  dom.tiltValue.textContent = `${Math.round(state.metrics.headTilt)}°`;
}

function resizeVisibleCanvas() {
  const rect = dom.avatarCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const nextWidth = Math.max(1, Math.round(rect.width * dpr));
  const nextHeight = Math.max(1, Math.round(rect.height * dpr));

  if (
    dom.avatarCanvas.width !== nextWidth ||
    dom.avatarCanvas.height !== nextHeight
  ) {
    dom.avatarCanvas.width = nextWidth;
    dom.avatarCanvas.height = nextHeight;
  }
}

function prepareOffscreenCanvas(canvas) {
  const fallbackWidth = Math.max(1, dom.avatarCanvas.width);
  const fallbackHeight = Math.max(1, dom.avatarCanvas.height);
  const width = dom.camera.videoWidth || fallbackWidth;
  const height = dom.camera.videoHeight || fallbackHeight;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function setStatus(message) {
  dom.cameraStatus.textContent = message;
}

function canUseCaptureControls() {
  return state.isReady && !state.isStarting && !state.countdownActive;
}

function updateMotionTargets(faceCenter, eyeDistance) {
  state.motion.targetNoseX = clamp(faceCenter.x, 0, 1);
  state.motion.targetNoseY = clamp(faceCenter.y, 0, 1);

  if (!window.baseEyeDistance && eyeDistance > 0) {
    window.baseEyeDistance = eyeDistance;
  }

  const baseEyeDistance = window.baseEyeDistance || eyeDistance;
  const nextScale = calculateTargetScale(eyeDistance, baseEyeDistance);
  const ratio = baseEyeDistance > 0 ? eyeDistance / baseEyeDistance : 1;

  state.motion.targetScale = nextScale;

  // Requested debug logs so scale calibration can be checked on-device.
  console.log("ratio:", ratio);
  console.log("scale:", nextScale);
}

function resetMotionTargets() {
  state.motion.targetNoseX = 0.5;
  state.motion.targetNoseY = 0.5;
  state.motion.targetScale = MOTION_CONFIG.idleScale;
}

function resolveMotionForCanvas(width, height, fitMode) {
  const sourceWidth = dom.camera.videoWidth || width;
  const sourceHeight = dom.camera.videoHeight || height;
  const placement = resolveVideoPlacement({
    sourceWidth,
    sourceHeight,
    targetWidth: width,
    targetHeight: height,
    fitMode
  });

  // Visible preview uses object-fit: cover, so the nose point must be projected
  // into the cropped video rectangle instead of using raw canvas percentages.
  const faceSize = MOTION_CONFIG.idleSize * state.motion.currentScale * placement.scale;

  return {
    x: placement.offsetX + state.motion.currentNoseX * placement.drawWidth,
    y: placement.offsetY + state.motion.currentNoseY * placement.drawHeight,
    size: faceSize
  };
}

function resolveVideoPlacement({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  fitMode
}) {
  if (fitMode === "cover") {
    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;

    return {
      drawWidth,
      drawHeight,
      offsetX: (targetWidth - drawWidth) / 2,
      offsetY: (targetHeight - drawHeight) / 2,
      scale
    };
  }

  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;

  return {
    drawWidth: targetWidth,
    drawHeight: targetHeight,
    offsetX: 0,
    offsetY: 0,
    scale: (scaleX + scaleY) / 2
  };
}

function calculateTargetScale(eyeDistance, baseEyeDistance) {
  if (!(eyeDistance > 0) || !(baseEyeDistance > 0)) {
    return MOTION_CONFIG.idleScale;
  }

  const rawScale = (eyeDistance / baseEyeDistance) * MOTION_CONFIG.scaleBoost;
  return clamp(rawScale, MOTION_CONFIG.minScale, MOTION_CONFIG.maxScale);
}

function calculateMouthOpen(blendshapeMap, landmarks) {
  const jawOpen = blendshapeMap.jawOpen ?? 0;
  if (jawOpen > 0) {
    return clamp(jawOpen, 0, 1);
  }

  const vertical = distance(
    landmarks[LANDMARK_INDEX.upperLip],
    landmarks[LANDMARK_INDEX.lowerLip]
  );
  const horizontal = distance(
    landmarks[LANDMARK_INDEX.mouthLeft],
    landmarks[LANDMARK_INDEX.mouthRight]
  );

  return clamp(normalizeRatio(vertical / Math.max(horizontal, 0.001), 0.02, 0.2), 0, 1);
}

function calculateEyeBlinkScore(blendshapeMap, landmarks) {
  const leftBlink = blendshapeMap.eyeBlinkLeft;
  const rightBlink = blendshapeMap.eyeBlinkRight;

  if (typeof leftBlink === "number" && typeof rightBlink === "number") {
    return clamp((leftBlink + rightBlink) / 2, 0, 1);
  }

  const leftEyeOpenness =
    distance(
      landmarks[LANDMARK_INDEX.leftEyeUpper],
      landmarks[LANDMARK_INDEX.leftEyeLower]
    ) /
    Math.max(
      distance(
        landmarks[LANDMARK_INDEX.leftEyeOuter],
        landmarks[LANDMARK_INDEX.leftEyeInner]
      ),
      0.001
    );
  const rightEyeOpenness =
    distance(
      landmarks[LANDMARK_INDEX.rightEyeUpper],
      landmarks[LANDMARK_INDEX.rightEyeLower]
    ) /
    Math.max(
      distance(
        landmarks[LANDMARK_INDEX.rightEyeOuter],
        landmarks[LANDMARK_INDEX.rightEyeInner]
      ),
      0.001
    );

  const openness = (leftEyeOpenness + rightEyeOpenness) / 2;
  return clamp(1 - normalizeRatio(openness, 0.12, 0.32), 0, 1);
}

function calculateHeadTilt(landmarks) {
  const leftEye = averagePoint(
    landmarks[LANDMARK_INDEX.leftEyeOuter],
    landmarks[LANDMARK_INDEX.leftEyeInner]
  );
  const rightEye = averagePoint(
    landmarks[LANDMARK_INDEX.rightEyeOuter],
    landmarks[LANDMARK_INDEX.rightEyeInner]
  );

  return (
    Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) *
    (180 / Math.PI)
  );
}

function calculateFaceCenter(landmarks) {
  const noseTip = landmarks[LANDMARK_INDEX.noseTip];
  if (isFinitePoint(noseTip)) {
    return {
      x: noseTip.x,
      y: noseTip.y
    };
  }

  const leftEye = averagePoint(
    landmarks[LANDMARK_INDEX.leftEyeOuter],
    landmarks[LANDMARK_INDEX.leftEyeInner]
  );
  const rightEye = averagePoint(
    landmarks[LANDMARK_INDEX.rightEyeOuter],
    landmarks[LANDMARK_INDEX.rightEyeInner]
  );

  return averagePoint(leftEye, rightEye);
}

function calculateEyeDistance(landmarks) {
  const leftEye = landmarks[LANDMARK_INDEX.leftEyeOuter];
  const rightEye = landmarks[LANDMARK_INDEX.rightEyeOuter];

  if (!isFinitePoint(leftEye) || !isFinitePoint(rightEye)) {
    return 0;
  }

  const dx = leftEye.x - rightEye.x;
  const dy = leftEye.y - rightEye.y;
  return Math.hypot(dx, dy);
}

function evaluateExpressions(expressionMap, metrics) {
  if (!expressionMap) {
    return {
      happy: false,
      blink: false,
      tilt: false
    };
  }

  return Object.fromEntries(
    Object.entries(expressionMap).map(([name, rule]) => [
      name,
      evaluateRule(rule, metrics)
    ])
  );
}

// Keep the avatar config human-readable by supporting simple comparisons such as
// "mouthOpen > 0.5" and "eyeBlink == true".
function evaluateRule(rule, metrics) {
  const match = String(rule)
    .trim()
    .match(/^([a-zA-Z_]\w*)\s*(>=|<=|==|!=|>|<)\s*(true|false|-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return false;
  }

  const [, leftKey, operator, rightRaw] = match;
  const leftValue = metrics[leftKey];
  const rightValue =
    rightRaw === "true"
      ? true
      : rightRaw === "false"
        ? false
        : Number(rightRaw);

  switch (operator) {
    case ">":
      return leftValue > rightValue;
    case "<":
      return leftValue < rightValue;
    case ">=":
      return leftValue >= rightValue;
    case "<=":
      return leftValue <= rightValue;
    case "==":
      return leftValue === rightValue;
    case "!=":
      return leftValue !== rightValue;
    default:
      return false;
  }
}

function bindEvents() {
  dom.startCameraBtn.addEventListener("click", startExperience);
  dom.photoBtn.addEventListener("click", handlePhotoCapture);
  dom.timerBtn.addEventListener("click", handleTimedCapture);
  dom.videoBtn.addEventListener("click", handleVideoButton);
  dom.closeResultBtn.addEventListener("click", closeResultSheet);
  dom.retakeBtn.addEventListener("click", closeResultSheet);
  window.addEventListener("resize", resizeVisibleCanvas);
  window.addEventListener("orientationchange", resizeVisibleCanvas);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.recording?.isActive) {
      stopRecording();
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.error("Service worker registration failed:", error);
    }
  });
}

function pickSupportedMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }

  const candidates = [
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function revokeActiveObjectUrl() {
  if (state.activeObjectUrl) {
    URL.revokeObjectURL(state.activeObjectUrl);
    state.activeObjectUrl = null;
  }
}

function createEmptyMetrics() {
  return {
    mouthOpen: 0,
    eyeBlink: false,
    eyeBlinkScore: 0,
    headTilt: 0,
    headTiltSigned: 0,
    faceCenterX: 0.5,
    faceCenterY: 0.5,
    faceWidth: 0,
    expressions: {
      happy: false,
      blink: false,
      tilt: false
    }
  };
}

function createMotionState() {
  return {
    currentNoseX: 0.5,
    currentNoseY: 0.5,
    targetNoseX: 0.5,
    targetNoseY: 0.5,
    currentScale: MOTION_CONFIG.idleScale,
    targetScale: MOTION_CONFIG.idleScale
  };
}

function waitForVideoMetadata(video) {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onLoadedMetadata = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      resolve();
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
  });
}

function averagePoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFinitePoint(point) {
  return Boolean(
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

function normalizeRatio(value, min, max) {
  return (value - min) / (max - min);
}

function lerp(current, target, factor) {
  return current + (target - current) * factor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function timestampLabel() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("") +
    "-" +
    [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
}
