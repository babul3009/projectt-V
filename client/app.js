const socket = io();

const video = document.getElementById("myVideo");

let localStream;
let peerConnections = {};
let iceQueue = {};
let hasLeft = false;
let userName = null;

let roomId = null;
if (window.location.pathname.includes("/room/")) {
    roomId = window.location.pathname.split("/room/")[1];
}

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

/* =========================
   Layout
========================= */

function updateLayout() {
    const container = document.getElementById("videoContainer");
    const wrappers = container.querySelectorAll(".video-wrapper");
    const count = wrappers.length;

    container.classList.remove("one-user", "two-users");

    if (count === 1) {
        container.classList.add("one-user");
        container.style.gridTemplateColumns = "1fr";
    } else if (count === 2) {
        container.classList.add("two-users");
        container.style.gridTemplateColumns = "1fr";
    } else if (count <= 4) {
        container.style.gridTemplateColumns = "1fr 1fr";
    } else {
        container.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
    }
}

function updateParticipants() {
    const count = document.querySelectorAll(".video-wrapper").length;
    document.getElementById("participantsCount").innerText = `👥 ${count}`;
}

/* =========================
   Camera
========================= */

async function startCamera() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    video.srcObject = localStream;
}

/* =========================
   Peer Connection
========================= */

function createPeerConnection(id) {
    if (peerConnections[id]) return peerConnections[id];

    const pc = new RTCPeerConnection(config);
    peerConnections[id] = pc;

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
        if (document.getElementById(id)) return;

        const wrapper = document.createElement("div");
        wrapper.className = "video-wrapper";
        wrapper.id = `wrapper-${id}`;

        const videoEl = document.createElement("video");
        videoEl.id = id;
        videoEl.autoplay = true;
        videoEl.playsInline = true;

        const reactionLayer = document.createElement("div");
        reactionLayer.className = "reaction-layer";
        reactionLayer.id = `reaction-${id}`;

        wrapper.appendChild(videoEl);
        wrapper.appendChild(reactionLayer);

        document.getElementById("videoContainer").appendChild(wrapper);

        videoEl.srcObject = event.streams[0];

        updateLayout();
        updateParticipants();
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", {
                candidate: event.candidate,
                to: id
            });
        }
    };

    return pc;
}

/* =========================
   Join Flow
========================= */

document.getElementById("joinBtn").onclick = async () => {
    userName = document.getElementById("nameInput").value;
    document.getElementById("namePopup").style.display = "none";

    await startCamera();
    startGestureDetection();

    socket.emit("join-room", {
        roomId,
        name: userName
    });
};

/* =========================
   Socket Events
========================= */

socket.on("existing-users", async (users) => {
    for (const user of users) {
        const pc = createPeerConnection(user.userId);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("offer", {
            offer,
            to: user.userId
        });
    }
});

socket.on("user-joined", ({ userId }) => {
    createPeerConnection(userId);
});

socket.on("offer", async ({ offer, from }) => {
    const pc = createPeerConnection(from);

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", {
        answer,
        to: from
    });
});

socket.on("answer", async ({ answer, from }) => {
    await peerConnections[from].setRemoteDescription(answer);
});

socket.on("ice-candidate", async ({ candidate, from }) => {
    await peerConnections[from].addIceCandidate(candidate);
});

socket.on("user-left", (userId) => {
    const wrapper = document.getElementById(`wrapper-${userId}`);
    if (wrapper) wrapper.remove();

    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }

    updateLayout();
    updateParticipants();
});

/* =========================
   REACTIONS
========================= */

function getLayer(id) {
    return document.getElementById(`reaction-${id}`);
}

/* HEART */
function showHeart(id) {
    const layer = getLayer(id);
    if (!layer) return;

    const core = document.createElement("div");
    core.className = "heart-core";

    const ring = document.createElement("div");
    ring.className = "heart-ring";

    layer.appendChild(core);
    layer.appendChild(ring);

    for (let i = 0; i < 6; i++) {
        const spark = document.createElement("div");
        spark.className = "heart-spark";
        spark.style.setProperty("--x", `${(Math.random() - 0.5) * 200}px`);
        spark.style.setProperty("--y", `${(Math.random() - 0.5) * 200}px`);
        layer.appendChild(spark);
    }

    setTimeout(() => layer.innerHTML = "", 1700);
}

/* THUMBS */
function showThumbs(id) {
    const layer = getLayer(id);
    if (!layer) return;

    const badge = document.createElement("div");
    badge.className = "thumb-badge";

    layer.appendChild(badge);

    for (let i = 0; i < 6; i++) {
        const ray = document.createElement("div");
        ray.className = "thumb-ray";
        ray.style.setProperty("--r", `${i * 60}deg`);
        layer.appendChild(ray);
    }

    setTimeout(() => layer.innerHTML = "", 1500);
}

/* ENERGY SHOT */
function showEnergy(id) {
    const layer = getLayer(id);
    if (!layer) return;

    const core = document.createElement("div");
    core.className = "energy-core";

    const wave = document.createElement("div");
    wave.className = "energy-wave";

    const beam = document.createElement("div");
    beam.className = "energy-beam";

    layer.appendChild(core);
    layer.appendChild(wave);
    layer.appendChild(beam);

    for (let i = 0; i < 5; i++) {
        const p = document.createElement("div");
        p.className = "energy-particle";
        p.style.setProperty("--x", `${Math.random() * 200}px`);
        p.style.setProperty("--y", `${(Math.random() - 0.5) * 150}px`);
        layer.appendChild(p);
    }

    setTimeout(() => layer.innerHTML = "", 800);
}

/* FLOWER */
function showFlower(id) {
    const layer = getLayer(id);
    if (!layer) return;

    const center = document.createElement("div");
    center.className = "flower-center";

    const stem = document.createElement("div");
    stem.className = "flower-stem";

    layer.appendChild(center);
    layer.appendChild(stem);

    for (let i = 0; i < 8; i++) {
        const petal = document.createElement("div");
        petal.className = "flower-petal";
        petal.style.setProperty("--r", `${i * 45}deg`);
        layer.appendChild(petal);
    }

    setTimeout(() => layer.innerHTML = "", 1500);
}

/* =========================
   Gesture Detection
========================= */

let lastTrigger = 0;

function startGestureDetection() {
    const hands = new Hands({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 2,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    hands.onResults(results => {
        if (!results.multiHandLandmarks) return;

        const now = Date.now();
        if (now - lastTrigger < 1500) return;

        const lm = results.multiHandLandmarks;

        if (lm.length === 2) {
            lastTrigger = now;
            showHeart("myVideo");
            socket.emit("heart-reaction", { roomId });
            return;
        }

        const hand = lm[0];

        // 👍 Thumbs
        if (hand[4].y < hand[3].y) {
            lastTrigger = now;
            showThumbs("myVideo");
            socket.emit("thumbs-reaction", { roomId });
            return;
        }

        // 👉 Energy shot
        if (hand[8].y < hand[6].y) {
            lastTrigger = now;
            showEnergy("myVideo");
            socket.emit("energy-reaction", { roomId });
            return;
        }

        // 👌 Flower
        if (Math.abs(hand[4].x - hand[8].x) < 0.05) {
            lastTrigger = now;
            showFlower("myVideo");
            socket.emit("flower-reaction", { roomId });
        }
    });

    const camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({ image: video });
        },
        width: 640,
        height: 480
    });

    camera.start();
}

/* =========================
   Receive reactions
========================= */

socket.on("heart-reaction", ({ userId }) => showHeart(userId));
socket.on("thumbs-reaction", ({ userId }) => showThumbs(userId));
socket.on("energy-reaction", ({ userId }) => showEnergy(userId));
socket.on("flower-reaction", ({ userId }) => showFlower(userId));