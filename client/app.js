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
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun.relay.metered.ca:80" },

        {
            urls: "turn:global.relay.metered.ca:80",
            username: "3efd3fe8e3626c590a5bc357",
            credential: "8kh0ZpUAO1dbNVuK"
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "3efd3fe8e3626c590a5bc357",
            credential: "8kh0ZpUAO1dbNVuK"
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "3efd3fe8e3626c590a5bc357",
            credential: "8kh0ZpUAO1dbNVuK"
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "3efd3fe8e3626c590a5bc357",
            credential: "8kh0ZpUAO1dbNVuK"
        }
    ],
    iceCandidatePoolSize: 10
};

function updateLayout() {
    const container = document.getElementById("videoContainer");
    const count = container.querySelectorAll(".video-wrapper").length;

    if (count === 1) container.style.gridTemplateColumns = "1fr";
    else if (count === 2) container.style.gridTemplateColumns = "1fr 1fr";
    else if (count <= 4) container.style.gridTemplateColumns = "1fr 1fr";
    else if (count <= 6) container.style.gridTemplateColumns = "1fr 1fr 1fr";
    else container.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
}

function updateParticipants() {
    const count = document.querySelectorAll("#videoContainer .video-wrapper").length;
    const label = count === 1 ? "Participant" : "Participants";
    const participantsCount = document.getElementById("participantsCount");

    if (participantsCount) {
        participantsCount.innerText = `👥 ${count} ${label}`;
    }
}

async function startCamera() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    video.srcObject = localStream;
    video.muted = true;

    updateLayout();
    updateParticipants();
}

function attachCommonPcHandlers(pc, id) {
    pc.ontrack = (event) => {
        let videoEl = document.getElementById(id);

        if (!videoEl) {
            const wrapper = document.createElement("div");
            wrapper.className = "video-wrapper";
            wrapper.id = `wrapper-${id}`;

            videoEl = document.createElement("video");
            videoEl.id = id;
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoEl.muted = false;

            wrapper.appendChild(videoEl);
            document.getElementById("videoContainer").appendChild(wrapper);

            updateLayout();
            updateParticipants();
        }

        const incomingStream = event.streams && event.streams[0];
        if (!incomingStream) return;

        if (videoEl.srcObject !== incomingStream) {
            videoEl.srcObject = incomingStream;
            videoEl.onloadedmetadata = () => {
                videoEl.play().catch(err => {
                    console.log("Video play error:", err);
                });
            };
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", {
                candidate: event.candidate,
                to: id
            });
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log("ICE state for", id, ":", pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
        console.log("PC state for", id, ":", pc.connectionState);
    };
}

function createPeerConnection(id) {
    const existing = peerConnections[id];
    if (existing) return existing;

    const pc = new RTCPeerConnection(config);
    peerConnections[id] = pc;
    iceQueue[id] = [];

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    attachCommonPcHandlers(pc, id);
    return pc;
}

const namePopup = document.getElementById("namePopup");
const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");

if (joinBtn) {
    joinBtn.addEventListener("click", async () => {
        const name = nameInput.value.trim();

        if (!name) {
            alert("Please enter your name");
            return;
        }

        userName = name;
        namePopup.style.display = "none";

        await startCamera();

        startHeartGestureDetection();

        if (!hasLeft && roomId) {
            socket.emit("join-room", {
                roomId,
                name: userName
            });
        }
    });
}

socket.on("connect", () => {
    console.log("Connected:", socket.id);
});

socket.on("existing-users", async (users) => {
    for (const user of users) {
        const { userId } = user;

        const pc = createPeerConnection(userId);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("offer", {
            offer,
            to: userId
        });
    }
});

socket.on("user-joined", async ({ userId }) => {
    if (hasLeft) return;
    createPeerConnection(userId);
});

socket.on("offer", async ({ offer, from }) => {
    if (hasLeft) return;

    const pc = createPeerConnection(from);

    await pc.setRemoteDescription(offer);

    if (iceQueue[from] && iceQueue[from].length > 0) {
        for (const c of iceQueue[from]) {
            await pc.addIceCandidate(c);
        }
        iceQueue[from] = [];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", {
        answer,
        to: from
    });
});

socket.on("answer", async ({ answer, from }) => {
    const pc = peerConnections[from];
    if (pc) {
        try {
            await pc.setRemoteDescription(answer);
        } catch (err) {
            console.log("Answer error:", err);
        }
    }
});

socket.on("ice-candidate", async ({ candidate, from }) => {
    const pc = peerConnections[from];
    if (!pc) return;

    if (!pc.remoteDescription) {
        if (!iceQueue[from]) iceQueue[from] = [];
        iceQueue[from].push(candidate);
        return;
    }

    try {
        await pc.addIceCandidate(candidate);
    } catch (err) {
        console.log("ICE error:", err);
    }
});

socket.on("user-left", (userId) => {
    const videoEl = document.getElementById(userId);

    if (videoEl) {
        videoEl.srcObject = null;

        const wrapper = document.getElementById(`wrapper-${userId}`);
        if (wrapper) {
            wrapper.remove();
        } else {
            videoEl.remove();
        }

        updateLayout();
        updateParticipants();
    }

    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }

    if (iceQueue[userId]) {
        delete iceQueue[userId];
    }
});

const muteBtn = document.getElementById("muteBtn");
let isMuted = false;

if (muteBtn) {
    muteBtn.addEventListener("click", () => {
        if (!localStream) return;

        localStream.getAudioTracks().forEach(track => {
            track.enabled = isMuted;
        });

        isMuted = !isMuted;

        muteBtn.innerHTML = isMuted
            ? '<i class="ph ph-microphone-slash"></i>'
            : '<i class="ph ph-microphone"></i>';
    });
}

const leaveBtn = document.getElementById("leaveBtn");

if (leaveBtn) {
    leaveBtn.addEventListener("click", () => {
        hasLeft = true;

        stopHeartGestureDetection();

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        Object.values(peerConnections).forEach(pc => pc.close());
        peerConnections = {};
        iceQueue = {};

        const videoContainer = document.getElementById("videoContainer");
        if (videoContainer) {
            videoContainer.innerHTML = "";
        }

        socket.disconnect();

        if (roomId) {
            window.location.href = `/leave?room=${roomId}`;
        } else {
            window.location.href = `/leave`;
        }
    });
}

const shareBtn = document.getElementById("shareBtn");
const popup = document.getElementById("sharePopup");
const closePopup = document.getElementById("closePopup");

const roomIdInput = document.getElementById("roomIdText");
const linkInput = document.getElementById("linkText");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");

function copyText(text, button) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        const temp = document.createElement("textarea");
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
    }

    const old = button.innerHTML;
    button.textContent = "Copied!";
    setTimeout(() => {
        button.innerHTML = old;
    }, 1200);
}

if (shareBtn && popup) {
    shareBtn.addEventListener("click", () => {
        popup.style.display = "flex";

        if (roomIdInput) {
            roomIdInput.value = roomId || "";
        }

        if (linkInput) {
            linkInput.value = `${window.location.origin}/room/${roomId}`;
        }
    });
}

if (closePopup && popup) {
    closePopup.addEventListener("click", () => {
        popup.style.display = "none";
    });
}

if (popup) {
    popup.addEventListener("click", (e) => {
        if (e.target === popup) {
            popup.style.display = "none";
        }
    });
}

if (copyRoomBtn) {
    copyRoomBtn.addEventListener("click", () => {
        copyText(roomId || "", copyRoomBtn);
    });
}

if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", () => {
        copyText(`${window.location.origin}/room/${roomId}`, copyLinkBtn);
    });
}

/* =========================
   Animated Heart Gesture
========================= */

let handsDetector = null;
let handsCamera = null;
let lastHeartTime = 0;
let isDetectingHeart = false;

function showAnimatedHeart(targetId = "myVideo") {
    const wrapper = document.getElementById(`wrapper-${targetId}`);
    if (!wrapper) return;

    const heart = document.createElement("div");
    heart.className = "heart-animation";

    const glow = document.createElement("div");
    glow.className = "heart-glow";
    heart.appendChild(glow);

    const particles = [
        { x: "-90px", y: "-80px", left: "10%", top: "35%" },
        { x: "90px", y: "-90px", left: "80%", top: "35%" },
        { x: "-70px", y: "70px", left: "20%", top: "75%" },
        { x: "75px", y: "65px", left: "75%", top: "75%" },
        { x: "0px", y: "-120px", left: "50%", top: "20%" },
        { x: "0px", y: "100px", left: "50%", top: "85%" }
    ];

    particles.forEach(p => {
        const particle = document.createElement("span");
        particle.className = "heart-particle";
        particle.style.left = p.left;
        particle.style.top = p.top;
        particle.style.setProperty("--x", p.x);
        particle.style.setProperty("--y", p.y);
        heart.appendChild(particle);
    });

    wrapper.appendChild(heart);

    setTimeout(() => {
        heart.remove();
    }, 1900);
}

function landmarkDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function isHeartGesture(landmarksList) {
    if (!landmarksList || landmarksList.length < 2) return false;

    const handA = landmarksList[0];
    const handB = landmarksList[1];

    const indexTipA = handA[8];
    const indexTipB = handB[8];

    const thumbTipA = handA[4];
    const thumbTipB = handB[4];

    const wristA = handA[0];
    const wristB = handB[0];

    const indexDistance = landmarkDistance(indexTipA, indexTipB);
    const thumbDistance = landmarkDistance(thumbTipA, thumbTipB);
    const wristDistance = landmarkDistance(wristA, wristB);

    const indexesClose = indexDistance < 0.12;
    const thumbsClose = thumbDistance < 0.14;
    const wristsApart = wristDistance > 0.18;

    return indexesClose && thumbsClose && wristsApart;
}

function startHeartGestureDetection() {
    if (isDetectingHeart) return;

    if (!window.Hands || !window.Camera) {
        console.log("MediaPipe Hands not loaded");
        return;
    }

    if (!video || !localStream) return;

    isDetectingHeart = true;

    handsDetector = new Hands({
        locateFile: file => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    handsDetector.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.75,
        minTrackingConfidence: 0.75
    });

    handsDetector.onResults(results => {
        if (!results.multiHandLandmarks) return;

        if (isHeartGesture(results.multiHandLandmarks)) {
            const now = Date.now();

            if (now - lastHeartTime > 2500) {
                lastHeartTime = now;

                showAnimatedHeart("myVideo");

                socket.emit("heart-reaction", {
                    roomId,
                    userId: socket.id
                });
            }
        }
    });

    handsCamera = new Camera(video, {
        onFrame: async () => {
            if (!hasLeft && video.readyState >= 2 && handsDetector) {
                await handsDetector.send({ image: video });
            }
        },
        width: 640,
        height: 480
    });

    handsCamera.start();
}

function stopHeartGestureDetection() {
    isDetectingHeart = false;

    if (handsCamera) {
        try {
            handsCamera.stop();
        } catch (err) {
            console.log("Camera stop error:", err);
        }
    }

    handsCamera = null;
    handsDetector = null;
}

socket.on("heart-reaction", ({ userId }) => {
    showAnimatedHeart(userId);
});