import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import {
  firebaseConfig,
  firestoreDatabaseId,
  rsvpCollections,
} from "./firebase-config.js?v=20260330g";

const rsvpState = {
  db: null,
  invite: null,
};

const RSVP_DEBUG = true;
const debugBuffer = [];

function debugLog(...args) {
  if (!RSVP_DEBUG) {
    return;
  }

  const line = args
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      try {
        return JSON.stringify(item, null, 2);
      } catch (_) {
        return String(item);
      }
    })
    .join(" ");

  debugBuffer.push(line);
  renderDebugPanel();
  console.log("[RSVP]", ...args);
}

function renderDebugPanel() {
  const debugEl = document.getElementById("rsvp-debug-log");

  if (!debugEl) {
    return;
  }

  debugEl.textContent = debugBuffer.join("\n");
}

initCountdown();
initReveal();
initMenu();
initRsvp();

function initCountdown() {
  const targetDate = new Date("2026-10-31T17:30:00");
  const daysEl = document.getElementById("days");
  const hoursEl = document.getElementById("hours");
  const minutesEl = document.getElementById("minutes");
  const secondsEl = document.getElementById("seconds");

  if (!daysEl || !hoursEl || !minutesEl || !secondsEl) {
    return;
  }

  function updateCountdown() {
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      daysEl.textContent = "0";
      hoursEl.textContent = "00";
      minutesEl.textContent = "00";
      secondsEl.textContent = "00";
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    daysEl.textContent = String(days);
    hoursEl.textContent = String(hours).padStart(2, "0");
    minutesEl.textContent = String(minutes).padStart(2, "0");
    secondsEl.textContent = String(seconds).padStart(2, "0");
  }

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
}

function initReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

function initMenu() {
  const sections = document.querySelectorAll("section, header");
  const navLinks = document.querySelectorAll(".menu a");

  if (!sections.length || !navLinks.length) {
    return;
  }

  function setActiveMenu() {
    let currentId = "inicio";

    sections.forEach((section) => {
      const top = section.offsetTop - 120;
      const height = section.offsetHeight;

      if (window.scrollY >= top && window.scrollY < top + height) {
        currentId = section.getAttribute("id") || currentId;
      }
    });

    navLinks.forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `#${currentId}`);
    });
  }

  window.addEventListener("scroll", setActiveMenu);
  setActiveMenu();
}

function initRsvp() {
  const form = document.getElementById("rsvp-form");
  const submitButton = document.getElementById("submit-rsvp");
  const summaryBox = document.getElementById("invite-summary");
  const fieldsBox = document.getElementById("rsvp-fields");
  const statusBox = document.getElementById("rsvp-status");
  const attendanceSelect = document.getElementById("attendance-count");
  const hotelCard = document.getElementById("hotel-card");
  const hotelNeededSelect = document.getElementById("hotel-needed");
  const hotelRoomsSelect = document.getElementById("hotel-rooms");
  const hotelLink = document.getElementById("hotel-link");
  const hotelCopy = document.getElementById("hotel-copy");
  const summaryName = document.getElementById("summary-name");
  const summaryId = document.getElementById("summary-id");
  const summaryAllowed = document.getElementById("summary-allowed");
  const summaryStatus = document.getElementById("summary-status");
  const summaryHelper = document.getElementById("summary-helper");

  debugLog("initRsvp() llamado");
  debugLog("URL actual", window.location.href);

  if (
    !form ||
    !submitButton ||
    !summaryBox ||
    !fieldsBox ||
    !statusBox ||
    !attendanceSelect ||
    !hotelCard ||
    !hotelNeededSelect ||
    !hotelRoomsSelect ||
    !hotelLink ||
    !hotelCopy ||
    !summaryName ||
    !summaryId ||
    !summaryAllowed ||
    !summaryStatus ||
    !summaryHelper
  ) {
    debugLog("Faltan elementos del formulario RSVP en el DOM");
    return;
  }

  if (!isFirebaseConfigReady(firebaseConfig)) {
    debugLog("Firebase config incompleta", firebaseConfig);
    setStatus(
      statusBox,
      "Configura primero tu proyecto en js/firebase-config.js para activar el RSVP con Firebase.",
      "error"
    );
    submitButton.disabled = true;
    return;
  }

  try {
    debugLog("Inicializando Firebase app", {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      firestoreDatabaseId,
    });

    const app = initializeApp(firebaseConfig);
    // For named databases, initializeFirestore with databaseId is more explicit.
    rsvpState.db = initializeFirestore(app, {}, firestoreDatabaseId);
    debugLog("Firestore inicializado correctamente", { firestoreDatabaseId });
  } catch (error) {
    console.error("Error al inicializar Firestore:", error);
    setStatus(
      statusBox,
      `No se pudo inicializar Firestore (${error?.code || error?.message || "error desconocido"}).`,
      "error"
    );
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!rsvpState.invite) {
      setStatus(
        statusBox,
        "No se encontro una invitacion activa en este enlace personalizado.",
        "error"
      );
      return;
    }

    const inviteId = normalizeInviteId(rsvpState.invite.id);
    const currentInvite = rsvpState.invite.data;
    const allowedGuests = getAllowedGuests(currentInvite);
    const attendanceCount = Number(attendanceSelect.value);
    const hotelConfig = getHotelConfig(currentInvite);
    const hotelNeeded = hotelConfig.enabled ? hotelNeededSelect.value : "no";
    const roomsRequested = hotelNeeded === "yes" ? Number(hotelRoomsSelect.value) : 0;

    if (!Number.isInteger(attendanceCount) || attendanceCount < 0) {
      setStatus(statusBox, "Selecciona el numero de asistentes.", "error");
      attendanceSelect.focus();
      return;
    }

    if (attendanceCount > allowedGuests) {
      setStatus(
        statusBox,
        `Esta invitacion solo puede confirmar ${allowedGuests} ${
          allowedGuests === 1 ? "persona" : "personas"
        }.`,
        "error"
      );
      attendanceSelect.focus();
      return;
    }

    if (hotelConfig.enabled) {
      if (!hotelNeeded) {
        setStatus(statusBox, "Indica si necesitaran hospedaje.", "error");
        hotelNeededSelect.focus();
        return;
      }

      if (hotelNeeded === "yes") {
        if (!Number.isInteger(roomsRequested) || roomsRequested < 1) {
          setStatus(statusBox, "Selecciona cuantas habitaciones desean reservar.", "error");
          hotelRoomsSelect.focus();
          return;
        }

        if (roomsRequested > hotelConfig.allowedRooms) {
          setStatus(
            statusBox,
            `Esta invitacion solo puede reservar ${hotelConfig.allowedRooms} ${
              hotelConfig.allowedRooms === 1 ? "habitacion" : "habitaciones"
            }.`,
            "error"
          );
          hotelRoomsSelect.focus();
          return;
        }
      }
    }

    const inviteRef = doc(rsvpState.db, rsvpCollections.invites, inviteId);
    const responseRef = doc(rsvpState.db, rsvpCollections.responses, inviteId);
    const nextStatus = attendanceCount > 0 ? "confirmed" : "declined";

    setButtonState(submitButton, true, "Guardando...");
    setStatus(statusBox, "Guardando tu confirmacion...", "default");

    try {
      const savedInvite = await runTransaction(rsvpState.db, async (transaction) => {
        const freshInviteSnap = await transaction.get(inviteRef);

        if (!freshInviteSnap.exists()) {
          throw new Error("INVITE_NOT_FOUND");
        }

        const freshInviteData = freshInviteSnap.data();
        const freshAllowedGuests = getAllowedGuests(freshInviteData);

        if (freshInviteData.locked === true) {
          throw new Error("INVITE_LOCKED");
        }

        if (attendanceCount > freshAllowedGuests) {
          throw new Error("LIMIT_EXCEEDED");
        }

        const responsePayload = {
          inviteId,
          invitationName: getInvitationName(freshInviteData),
          allowedGuests: freshAllowedGuests,
          confirmedGuests: attendanceCount,
          status: nextStatus,
          hotelEligible: hotelConfig.enabled,
          hotelRequested: hotelConfig.enabled ? hotelNeeded === "yes" : false,
          allowedRooms: hotelConfig.allowedRooms,
          roomsRequested: hotelConfig.enabled && hotelNeeded === "yes" ? roomsRequested : 0,
          hotelInfoUrl: hotelConfig.infoUrl,
          respondedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: "web-invitation",
        };

        const inviteUpdate = {
          status: nextStatus,
          confirmedGuests: attendanceCount,
          hotelRequested: hotelConfig.enabled ? hotelNeeded === "yes" : false,
          roomsRequested: hotelConfig.enabled && hotelNeeded === "yes" ? roomsRequested : 0,
          respondedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        transaction.set(responseRef, responsePayload, { merge: true });
        transaction.set(inviteRef, inviteUpdate, { merge: true });

        return {
          ...freshInviteData,
          ...inviteUpdate,
          allowedGuests: freshAllowedGuests,
        };
      });

      rsvpState.invite = {
        id: inviteId,
        data: savedInvite,
      };

      hydrateInviteUI(savedInvite, {
        summaryBox,
        fieldsBox,
        attendanceSelect,
        hotelCard,
        hotelNeededSelect,
        hotelRoomsSelect,
        hotelLink,
        hotelCopy,
        summaryName,
        summaryId,
        summaryAllowed,
        summaryStatus,
        summaryHelper,
      });

      const successMessage =
        attendanceCount > 0
          ? `Listo. La confirmacion ${inviteId} se guardo con ${attendanceCount} ${
              attendanceCount === 1 ? "asistente" : "asistentes"
            }.`
          : `Listo. Registramos la invitacion ${inviteId} como no asistira.`;

      setStatus(statusBox, successMessage, "success");
    } catch (error) {
      setStatus(statusBox, getFriendlyError(error), "error");
    } finally {
      setButtonState(submitButton, false, "Confirmar asistencia");
    }
  });

  const urlInviteId = getInviteIdFromUrl();
  debugLog("inviteId detectado en URL", urlInviteId);

  if (!urlInviteId) {
    setStatus(
      statusBox,
      "Esta invitacion debe abrirse desde su enlace personalizado para cargar los datos automaticamente.",
      "error"
    );
    return;
  }

  setStatus(
    statusBox,
    `Conectando a Firebase y buscando la invitacion ${urlInviteId}...`,
    "default"
  );

  lookupInvite(urlInviteId, {
    statusBox,
    summaryBox,
    fieldsBox,
    attendanceSelect,
    hotelCard,
    hotelNeededSelect,
    hotelRoomsSelect,
    hotelLink,
    hotelCopy,
    summaryName,
    summaryId,
    summaryAllowed,
    summaryStatus,
    summaryHelper,
  });
}

async function lookupInvite(inviteId, elements) {
  const {
    statusBox,
    summaryBox,
    fieldsBox,
    attendanceSelect,
    hotelCard,
    hotelNeededSelect,
    hotelRoomsSelect,
    hotelLink,
    hotelCopy,
    summaryName,
    summaryId,
    summaryAllowed,
    summaryStatus,
    summaryHelper,
  } = elements;

  setStatus(statusBox, "Cargando tu invitacion...", "default");
  summaryBox.hidden = true;
  fieldsBox.hidden = true;

  try {
    debugLog("Buscando invitacion en Firestore", {
      databaseId: firestoreDatabaseId,
      collection: rsvpCollections.invites,
      inviteId,
    });

    const inviteRef = doc(rsvpState.db, rsvpCollections.invites, inviteId);
    debugLog("Referencia generada", inviteRef.path);
    const inviteSnap = await withTimeout(getDoc(inviteRef), 10000, "TIMEOUT");
    debugLog("Respuesta de getDoc recibida", {
      exists: inviteSnap.exists(),
      inviteId,
    });

    if (!inviteSnap.exists()) {
      throw new Error("INVITE_NOT_FOUND");
    }

    const inviteData = inviteSnap.data();
    const allowedGuests = getAllowedGuests(inviteData);

    if (!Number.isInteger(allowedGuests) || allowedGuests < 0) {
      throw new Error("INVALID_LIMIT");
    }

    rsvpState.invite = {
      id: inviteId,
      data: inviteData,
    };

    debugLog("Invitacion cargada", inviteData);

    hydrateInviteUI(inviteData, {
      summaryBox,
      fieldsBox,
      attendanceSelect,
      hotelCard,
      hotelNeededSelect,
      hotelRoomsSelect,
      hotelLink,
      hotelCopy,
      summaryName,
      summaryId,
      summaryAllowed,
      summaryStatus,
      summaryHelper,
    });

    summaryId.textContent = inviteId;
    setStatus(
      statusBox,
      "Invitacion cargada. Solo selecciona cuantas personas asistiran.",
      "success"
    );
  } catch (error) {
    console.error("Error al cargar la invitacion:", error);
    debugLog("Fallo lookupInvite", {
      inviteId,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    rsvpState.invite = null;
    setStatus(statusBox, getFriendlyError(error), "error");
  }
}

function hydrateInviteUI(inviteData, elements) {
  const {
    summaryBox,
    fieldsBox,
    attendanceSelect,
    hotelCard,
    hotelNeededSelect,
    hotelRoomsSelect,
    hotelLink,
    hotelCopy,
    summaryName,
    summaryId,
    summaryAllowed,
    summaryStatus,
    summaryHelper,
  } = elements;

  const inviteId = rsvpState.invite?.id || "";
  const allowedGuests = getAllowedGuests(inviteData);
  const invitationName = getInvitationName(inviteData);
  const currentStatus = formatInviteStatus(inviteData.status);
  const previousGuests = getPreviousConfirmedGuests(inviteData, allowedGuests);
  const hotelConfig = getHotelConfig(inviteData);

  summaryName.textContent = invitationName;
  summaryId.textContent = inviteId;
  summaryAllowed.textContent = String(allowedGuests);
  summaryStatus.textContent = currentStatus;
  summaryHelper.textContent =
    previousGuests > 0
      ? `Ya habia una respuesta guardada con ${previousGuests} ${
          previousGuests === 1 ? "asistente" : "asistentes"
        }. Puedes actualizarla si lo necesitas.`
      : `Esta invitacion puede confirmar hasta ${allowedGuests} ${
          allowedGuests === 1 ? "asistente" : "asistentes"
        }.`;

  populateAttendanceOptions(attendanceSelect, allowedGuests, previousGuests);
  hydrateHotelUI(hotelConfig, inviteData, {
    hotelCard,
    hotelNeededSelect,
    hotelRoomsSelect,
    hotelLink,
    hotelCopy,
  });

  summaryBox.hidden = false;
  fieldsBox.hidden = false;
}

function populateAttendanceOptions(select, allowedGuests, selectedGuests) {
  const currentValue = Number.isInteger(selectedGuests) ? selectedGuests : "";

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecciona una opcion";
  select.appendChild(placeholder);

  for (let count = 0; count <= allowedGuests; count += 1) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent =
      count === 0
        ? "No podremos asistir"
        : `${count} ${count === 1 ? "asistente" : "asistentes"}`;

    if (count === currentValue) {
      option.selected = true;
    }

    select.appendChild(option);
  }
}

function hydrateHotelUI(hotelConfig, inviteData, elements) {
  const { hotelCard, hotelNeededSelect, hotelRoomsSelect, hotelLink, hotelCopy } = elements;

  if (!hotelConfig.enabled) {
    hotelCard.hidden = true;
    hotelNeededSelect.value = "";
    populateHotelRoomOptions(hotelRoomsSelect, 0, 0);
    hotelLink.hidden = true;
    hotelLink.removeAttribute("href");
    return;
  }

  const previousRequested = getPreviousRoomsRequested(inviteData, hotelConfig.allowedRooms);
  const hotelNeeded = previousRequested > 0 || inviteData.hotelRequested === true ? "yes" : "";

  hotelCard.hidden = false;
  hotelCopy.textContent =
    hotelConfig.allowedRooms > 0
      ? `Tu invitacion puede reservar hasta ${hotelConfig.allowedRooms} ${
          hotelConfig.allowedRooms === 1 ? "habitacion" : "habitaciones"
        }${hotelConfig.nights > 0 ? ` por ${hotelConfig.nights} ${hotelConfig.nights === 1 ? "noche" : "noches"}` : ""}.`
      : "Tu invitacion incluye acceso al modulo de hospedaje.";

  hotelNeededSelect.value = hotelNeeded;
  populateHotelRoomOptions(
    hotelRoomsSelect,
    hotelConfig.allowedRooms,
    hotelNeeded === "yes" ? previousRequested : 0
  );
  hotelRoomsSelect.disabled = hotelNeeded !== "yes";

  hotelNeededSelect.onchange = () => {
    const wantsHotel = hotelNeededSelect.value === "yes";
    hotelRoomsSelect.disabled = !wantsHotel;
    populateHotelRoomOptions(hotelRoomsSelect, hotelConfig.allowedRooms, wantsHotel ? previousRequested : 0);
  };

  if (hotelConfig.infoUrl) {
    hotelLink.href = hotelConfig.infoUrl;
    hotelLink.hidden = false;
  } else {
    hotelLink.hidden = true;
    hotelLink.removeAttribute("href");
  }
}

function populateHotelRoomOptions(select, allowedRooms, selectedRooms) {
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecciona una opcion";
  select.appendChild(placeholder);

  for (let count = 1; count <= allowedRooms; count += 1) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = `${count} ${count === 1 ? "habitacion" : "habitaciones"}`;

    if (count === selectedRooms) {
      option.selected = true;
    }

    select.appendChild(option);
  }
}

function getInvitationName(inviteData) {
  return (
    inviteData.groupName ||
    inviteData.familyName ||
    inviteData.primaryName ||
    inviteData.inviteeName ||
    "Invitacion encontrada"
  );
}

function getAllowedGuests(inviteData) {
  const rawValue =
    inviteData.allowedGuests ??
    inviteData.guestLimit ??
    inviteData.invitadosAsignados ??
    inviteData.maxGuests ??
    0;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function getPreviousConfirmedGuests(inviteData, allowedGuests) {
  const rawValue = Number(
    inviteData.confirmedGuests ??
      inviteData.lastConfirmedGuests ??
      inviteData.attendanceCount ??
      0
  );

  if (!Number.isFinite(rawValue)) {
    return 0;
  }

  return Math.max(0, Math.min(allowedGuests, Math.floor(rawValue)));
}

function getPreviousRoomsRequested(inviteData, allowedRooms) {
  const rawValue = Number(
    inviteData.roomsRequested ??
      inviteData.hotelRooms ??
      inviteData.lastRoomsRequested ??
      0
  );

  if (!Number.isFinite(rawValue)) {
    return 0;
  }

  return Math.max(0, Math.min(allowedRooms, Math.floor(rawValue)));
}

function getHotelConfig(inviteData) {
  const enabled =
    inviteData.hotelEligible === true ||
    inviteData.hotelEnabled === true ||
    true;
  const rawRooms =
    inviteData.allowedRooms ??
    inviteData.hotelRoomLimit ??
    inviteData.habitacionesAsignadas ??
    0;
  const rawNights =
    inviteData.hotelNights ??
    inviteData.nightsIncluded ??
    inviteData.nochesHospedaje ??
    0;

  return {
    enabled,
    allowedRooms: Number.isFinite(Number(rawRooms)) ? Math.max(0, Math.floor(Number(rawRooms))) : 0,
    nights: Number.isFinite(Number(rawNights)) ? Math.max(0, Math.floor(Number(rawNights))) : 0,
    infoUrl: String(
      inviteData.hotelInfoUrl ??
        inviteData.hotelLink ??
        inviteData.hotelRatesUrl ??
        ""
    ).trim(),
  };
}

function formatInviteStatus(status) {
  switch (status) {
    case "confirmed":
      return "Confirmada";
    case "declined":
      return "No asistira";
    case "pending":
    default:
      return "Pendiente";
  }
}

function getInviteIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const inviteId =
    params.get("inviteId") || params.get("invitacion") || params.get("id") || "";
  return normalizeInviteId(inviteId);
}

function normalizeInviteId(value) {
  return String(value || "").trim();
}

function withTimeout(promise, ms, code) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        debugLog(`Timeout de ${ms}ms alcanzado`, code);
        reject(new Error(code));
      }, ms);
    }),
  ]);
}

function setStatus(element, message, tone) {
  element.textContent = message;
  element.classList.remove("is-error", "is-success");

  if (tone === "error") {
    element.classList.add("is-error");
  }

  if (tone === "success") {
    element.classList.add("is-success");
  }
}

function setButtonState(button, isBusy, busyLabel) {
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel =
      button.id === "submit-rsvp"
        ? button.textContent.replace("→", "").trim()
        : button.textContent.trim();
  }

  button.disabled = isBusy;

  if (button.id === "submit-rsvp") {
    button.innerHTML = isBusy
      ? busyLabel
      : `${button.dataset.defaultLabel} <span>→</span>`;
    return;
  }

  button.textContent = isBusy ? busyLabel : button.dataset.defaultLabel;
}

function isFirebaseConfigReady(config) {
  return ["apiKey", "authDomain", "projectId", "appId"].every((key) =>
    String(config[key] || "").trim()
  );
}

function getFriendlyError(error) {
  const code = error?.message || "";
  const firebaseCode = error?.code || "";

  switch (code) {
    case "INVITE_NOT_FOUND":
      return "No encontramos una invitacion con ese ID. Revisa el codigo o usa tu enlace personalizado.";
    case "INVALID_LIMIT":
      return "Esta invitacion no tiene un numero de asistentes valido en Firebase.";
    case "LIMIT_EXCEEDED":
      return "El numero de asistentes excede el cupo asignado para esta invitacion.";
    case "INVITE_LOCKED":
      return "Esta invitacion ya no permite cambios. Contacta a los novios para apoyo.";
    case "TIMEOUT":
      return "La lectura de Firebase esta tardando demasiado. Revisa tu conexion, las reglas y vuelve a intentar.";
    default:
      if (firebaseCode === "permission-denied") {
        return "Firebase no permite leer esta invitacion. Revisa las reglas de Firestore para rsvpInvites y rsvpResponses.";
      }

      if (firebaseCode === "unavailable") {
        return "Firebase no esta disponible en este momento. Intenta de nuevo en unos minutos.";
      }

      return `Ocurrio un error al conectar con Firebase. ${firebaseCode || "Verifica tu configuracion e intenta de nuevo."}`;
  }
}
