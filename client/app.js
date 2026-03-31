// 🔌 Connect to server
const socket = io();

// 🎥 Local video
const video = document.getElementById("myVideo");

// 🌐 Variables
let localStream;
let peerConnections = {};
let iceQueue = {};
let hasLeft = false;
let userName = null;

//  Get roomId from URL
let roomId = null;
if (window.location.pathname.includes("/room/")) {
    roomId = window.location.pathname.split("/room/")[1];
}

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

// =================  GRID FIX =================
function updateLayout() {
    const container = document.getElementById("videoContainer");
    const count = container.querySelectorAll("video").length;

    if (count === 1) container.style.gridTemplateColumns = "1fr";
    else if (count === 2) container.style.gridTemplateColumns = "1fr 1fr";
    else if (count <= 4) container.style.gridTemplateColumns = "1fr 1fr";
    else if (count <= 6) container.style.gridTemplateColumns = "1fr 1fr 1fr";
    else container.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
}

// ================= 👥 PARTICIPANTS =================
function updateParticipants() {
    const count = document.querySelectorAll("#videoContainer video").length;
    const text = count === 1 ? "Participant" : "Participants";

    document.getElementById("participantsCount").innerText =
        `👥 ${count} ${text}`;
}

//  Start camera
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

// ================= NAME POPUP =================
const namePopup = document.getElementById("namePopup");
const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");

joinBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();

    if (!name) {
        alert("Please enter your name");
        return;
    }

    userName = name;

    namePopup.style.display = "none";

    await startCamera();

    if (!hasLeft && roomId) {
        socket.emit("join-room", {
            roomId,
            name: userName
        });
    }
});

// ================= SOCKET =================

socket.on("connect", () => {
    console.log("Connected:", socket.id);
});

// ================= EXISTING USERS =================
socket.on("existing-users", async (users) => {

    for (let user of users) {

        const { userId } = user;

        const pc = new RTCPeerConnection(config);
        peerConnections[userId] = pc;
        iceQueue[userId] = [];

        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        pc.ontrack = (event) => {
            let videoEl = document.getElementById(userId);

            if (!videoEl) {
                videoEl = document.createElement("video");
                videoEl.id = userId;
                videoEl.autoplay = true;
                videoEl.playsInline = true;

                document.getElementById("videoContainer").appendChild(videoEl);
                updateLayout();
                updateParticipants();
            }

            videoEl.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", {
                    candidate: event.candidate,
                    to: userId
                });
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("offer", {
            offer,
            to: userId
        });
    }
});

// ================= USER JOINED =================
socket.on("user-joined", async ({ userId, name }) => {
    if (hasLeft) return;

    const pc = new RTCPeerConnection(config);
    peerConnections[userId] = pc;
    iceQueue[userId] = [];

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
        let videoEl = document.getElementById(userId);

        if (!videoEl) {
            videoEl = document.createElement("video");
            videoEl.id = userId;
            videoEl.autoplay = true;
            videoEl.playsInline = true;

            document.getElementById("videoContainer").appendChild(videoEl);
            updateLayout();
            updateParticipants();
        }

        videoEl.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", {
                candidate: event.candidate,
                to: userId
            });
        }
    };

    
});

// ================= OFFER =================
socket.on("offer", async ({ offer, from }) => {
    if (hasLeft) return;

    const pc = new RTCPeerConnection(config);
    peerConnections[from] = pc;
    iceQueue[from] = [];

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
        let videoEl = document.getElementById(from);

        if (!videoEl) {
            videoEl = document.createElement("video");
            videoEl.id = from;
            videoEl.autoplay = true;
            videoEl.playsInline = true;

            document.getElementById("videoContainer").appendChild(videoEl);
            updateLayout();
            updateParticipants();
        }

        videoEl.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", {
                candidate: event.candidate,
                to: from
            });
        }
    };

    await pc.setRemoteDescription(offer);

    if (iceQueue[from]) {
        for (let c of iceQueue[from]) {
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

// ================= ANSWER =================
socket.on("answer", async ({ answer, from }) => {
    const pc = peerConnections[from];
    if (pc) {
        await pc.setRemoteDescription(answer);
    }
});

// ================= ICE =================
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

// ================= USER LEFT =================
socket.on("user-left", (userId) => {
    const videoEl = document.getElementById(userId);
    if (videoEl) {
        videoEl.srcObject = null;
        videoEl.remove();
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

// ================= MUTE =================
const muteBtn = document.getElementById("muteBtn");
let isMuted = false;

muteBtn.addEventListener("click", () => {
    if (!localStream) return;

    localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
    });

    isMuted = !isMuted;

    // 🔥 ICON SWITCH
    muteBtn.innerHTML = isMuted
        ? '<i class="ph ph-microphone-slash"></i>'
        : '<i class="ph ph-microphone"></i>';
});

// ================= LEAVE =================
const leaveBtn = document.getElementById("leaveBtn");

leaveBtn.addEventListener("click", () => {

    hasLeft = true;

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    document.getElementById("videoContainer").innerHTML = "";

    socket.disconnect();

    if (roomId) {
        window.location.href = `/leave?room=${roomId}`;
    } else {
        window.location.href = `/leave`;
    }
});

// ================= SHARE POPUP =================

const shareBtn = document.getElementById("shareBtn");
const popup = document.getElementById("sharePopup");
const closePopup = document.getElementById("closePopup");

const roomIdText = document.getElementById("roomIdText");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");

// Open popup
if (shareBtn) {
    shareBtn.addEventListener("click", () => {
        popup.style.display = "block";
        roomIdText.innerText = roomId;
    });
}

// Close popup
if (closePopup) {
    closePopup.addEventListener("click", () => {
        popup.style.display = "none";
    });
}

// Copy Room ID
if (copyRoomBtn) {
    copyRoomBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(roomId);
        copyRoomBtn.innerText = "Copied!";
        setTimeout(() => copyRoomBtn.innerText = "Copy", 1500);
    });
}

// Copy Link
if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", () => {
        const fullLink = `${window.location.origin}/room/${roomId}`;
        navigator.clipboard.writeText(fullLink);
        copyLinkBtn.innerText = "Copied!";
        setTimeout(() => copyLinkBtn.innerText = "Copy", 1500);
    });
}