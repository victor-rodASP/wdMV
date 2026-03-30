# Firebase RSVP Setup

Este flujo usa dos colecciones de Firestore:

- `rsvpInvites`: invitaciones precargadas con un ID unico por invitacion.
- `rsvpResponses`: respuestas guardadas con el mismo ID para localizar facilmente cada confirmacion.

## 1. Configura Firebase

Abre [js/firebase-config.js](/Users/copadov/Documents/WD/js/firebase-config.js) y reemplaza los valores vacios con la configuracion de tu proyecto web de Firebase.

Si tu proyecto usa una base nombrada distinta de `(default)`, define tambien:

```js
export const firestoreDatabaseId = "wd-myv";
```

## 2. Crea tus invitaciones precargadas

En Firestore crea documentos dentro de `rsvpInvites` usando como ID el codigo unico de cada invitacion.

Ejemplo de documento `rsvpInvites/MV-001`:

```json
{
  "groupName": "Familia Perez",
  "allowedGuests": 4,
  "hotelEligible": true,
  "allowedRooms": 2,
  "hotelNights": 1,
  "hotelInfoUrl": "https://tu-dominio.com/hotel",
  "status": "pending",
  "confirmedGuests": 0,
  "contactName": "Ana Perez"
}
```

Campos recomendados:

- `groupName`: nombre visible de la invitacion.
- `allowedGuests`: cupo maximo asignado.
- `hotelEligible`: activa o desactiva el bloque de hospedaje en el formulario.
- `allowedRooms`: numero maximo de habitaciones que puede reservar esa invitacion.
- `hotelNights`: opcional. numero de noches contempladas.
- `hotelInfoUrl`: link a la pagina con tarifas, tipos de habitacion o detalles del hotel.
- `status`: `pending`, `confirmed` o `declined`.
- `confirmedGuests`: asistentes confirmados actualmente.
- `locked`: opcional. Si es `true`, la invitacion ya no se puede editar.

## 3. Comparte enlaces personalizados

Puedes enviar cada invitacion con un link como este:

```text
https://tu-dominio.com/boda.html?inviteId=MV-001
```

El formulario leerá el ID y buscará automaticamente la invitacion.

## 4. Como se guarda cada confirmacion

Cuando alguien confirma:

- se actualiza `rsvpInvites/{inviteId}`
- se guarda o actualiza `rsvpResponses/{inviteId}`

Ejemplo de respuesta:

```json
{
  "inviteId": "MV-001",
  "invitationName": "Familia Perez",
  "allowedGuests": 4,
  "confirmedGuests": 3,
  "status": "confirmed",
  "hotelEligible": true,
  "hotelRequested": true,
  "allowedRooms": 2,
  "roomsRequested": 1,
  "hotelInfoUrl": "https://tu-dominio.com/hotel"
}
```

## 5. Reglas sugeridas

Como este proyecto es una invitacion publica, lo recomendable es endurecer seguridad despues.
La version actual del frontend asume que el cliente web puede leer y actualizar solo estas colecciones.

Para una version mas segura:

- mueve la escritura a una Cloud Function o backend propio
- valida el ID y el cupo del lado servidor
- limita lecturas a los campos estrictamente necesarios
