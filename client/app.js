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

    ],
    iceCandidatePoolSize: 10
};

function updateLayout() {
    const container = document.getElementById("videoContainer");
    const count = container.querySelectorAll("video").length;

    if (count === 1) container.style.gridTemplateColumns = "1fr";
    else if (count === 2) container.style.gridTemplateColumns = "1fr 1fr";
    else if (count <= 4) container.style.gridTemplateColumns = "1fr 1fr";
    else if (count <= 6) container.style.gridTemplateColumns = "1fr 1fr 1fr";
    else container.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
}

function updateParticipants() {
    const count = document.querySelectorAll("#videoContainer video").length;
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
            videoEl = document.createElement("video");
            videoEl.id = id;
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoEl.muted = false;

            document.getElementById("videoContainer").appendChild(videoEl);
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