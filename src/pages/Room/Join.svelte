<script lang="typescript">
  import SettingsForm from "./settings-form.svelte";
  import SpotForm from "./spot-form.svelte";
  import Spot from "./spot.svelte";

  import { replace } from "svelte-spa-router";
  import { fade } from "svelte/transition";

  import { EventBusSingleton as EventBus } from "light-event-bus";

  import { myPublicKey, mySecretKey } from "../../common/crypto";
  import { dbrest } from "../../common/firebase";
  import { initPeerKey, setupPeerConnection } from "./common";
  import { _roomId$, roomId$, _playerId$, playerId$, wizard$, settings$, spots$, gamen$ } from "../../common/datastore";
  import * as global from "../../common/dataglobal";
  import * as msgbus from "../../common/msgbus";
  import * as wizard from "../../common/wizard";
  import * as utils from "../../common/utils";
  import * as errors from "../../common/errors";

  export let params: any = {};

  $: if (wizard.isAfter($wizard$, wizard.steps.WAIT_FOR_SPOTS)) {
    if ($playerId$ == "host") {
      replace(`/game/create/${$roomId$}`);
    } else {
      replace(`/game/join/${$roomId$}`);
    }
  } else if ($_roomId$ && $_playerId$) {
    if ($_playerId$ == "host") {
      replace(`/room/create/${$_roomId$}`);
    } else {
      if (params.id != $_roomId$) {
        replace(`/room/join/${$_roomId$}`);
      }
    }
  }

  async function joinRoomQueue() {
    try {
      $wizard$ = wizard.next($wizard$);
      $_playerId$ = "12345";
      $_roomId$ = params.id;

      let response, json;

      response = await dbrest(`rooms/${params.id}.json`);
      if (!response.ok) {
        console.log(response.status);
        return errors.fatal(errors.fatalEnum.FIRESTORE_ERROR);
      }
      json = await response.json();
      if (!json) {
        console.log("Room not found.");
        return errors.fatal(errors.fatalEnum.NO_SUCH_ROOM);
      }
      if (json.status != "open") {
        console.log("Room is not open.");
        return errors.fatal(errors.fatalEnum.ROOM_FULL);
      }
      $_roomId$ = params.id as string;
      Object.assign(global.players["host"], json["players"]["host"]);

      response = await dbrest(`rooms/${$_roomId$}/players.json`, {
        method: "POST",
        body: JSON.stringify({ publicKey: myPublicKey }),
      });
      if (!response.ok) {
        console.log(response.status);
        return errors.fatal(errors.fatalEnum.FIRESTORE_ERROR);
      }

      json = await response.json();
      $_playerId$ = json.name as string;

      global.players[$_playerId$] = { publicKey: myPublicKey };

      msgbus.firestoreListen($_roomId$, $_playerId$, mySecretKey);

      await initPeerKey(global.players, $_roomId$, "host");
      await setupPeerConnection(global.players, $_roomId$, $_playerId$, "host");

      $playerId$ = $_playerId$;
      $roomId$ = $_roomId$;
      $wizard$ = wizard.next($wizard$);

      getRoomSettings();
    } catch (err) {
      console.log(err);
      return errors.fatal(errors.fatalEnum.UNEXPECTED);
    }
  }

  if (wizard.isIn($wizard$, wizard.steps.ROOM_SETTINGS, "todo")) getRoomSettings();
  async function getRoomSettings() {
    $wizard$ = wizard.next($wizard$);

    let response = await dbrest(`rooms/${$roomId$}/settings.json`);
    if (!response.ok) {
      console.log(response.status);
      return errors.fatal(errors.fatalEnum.FIRESTORE_ERROR);
    }
    let json = await response.json();
    $settings$ = json;

    $wizard$ = wizard.next($wizard$);
  }

  let _spotName: string = "";
  let _spotAvatar: string = "";
  let _spotTeam: string = "";
  let _spotErrors: string[] = [];

  async function markYourSpot() {
    $wizard$ = wizard.next($wizard$);

    _spotErrors = [];
    if (!_spotName) {
      _spotErrors = ["Name is required.", ..._spotErrors];
    }
    if (!_spotAvatar) {
      _spotErrors = ["Avatar is required.", ..._spotErrors];
    }
    if (!_spotTeam) {
      _spotErrors = ["Team is required.", ..._spotErrors];
    }
    if (_spotErrors.length) {
      $wizard$ = wizard.back($wizard$);
      return;
    }

    const spot: any = {
      name: _spotName,
      avatar: _spotAvatar,
      team: _spotTeam,
    };

    msgbus.send(global.players, $roomId$, $playerId$, "host", "saveSpot", spot);
    const response: any = await new Promise((resolve) => {
      let subscription = EventBus.subscribe("saveSpotAck", (arg: any) => {
        subscription.unsubscribe();
        resolve(arg.payload);
      });
    });
    _spotErrors = response["errors"];
    $gamen$ = response["gamen"];
    $spots$ = response["spots"];

    if (_spotErrors.length) {
      $wizard$ = wizard.back($wizard$);
      return;
    }

    $wizard$ = wizard.next($wizard$);
    waitForSpots();
  }

  if (wizard.isIn($wizard$, wizard.steps.WAIT_FOR_SPOTS, "todo")) waitForSpots();
  function waitForSpots() {
    $wizard$ = wizard.next($wizard$);

    msgbus.firestoreUnsubscribe();

    EventBus.publish("roomChatMsg", {
      from: "internal",
      data: "Waiting for players to start a new game.",
    });

    $spots$[$playerId$]["wizard"] = $wizard$;
    $spots$[$playerId$]["gamen"] = $gamen$ + 1;
    $spots$ = $spots$;

    msgbus.send(global.players, $roomId$, $playerId$, "host", "updateSpot", { [$playerId$]: $spots$[$playerId$] });
  }
</script>

<style>
  .loading:after {
    overflow: hidden;
    position: fixed;
    display: inline-block;
    vertical-align: bottom;
    animation: ellipsis steps(4, end) 900ms infinite;
    content: "\2026"; /* ascii code for the ellipsis character */
    width: 0px;
  }

  @keyframes ellipsis {
    to {
      width: 1.25em;
    }
  }

  .inactive {
    @apply opacity-50;
  }
  td {
    @apply align-top;
    @apply p-1;
    @apply text-2xl;
  }

  td.icon {
    text-align: center;
  }
</style>

<div class="w-full flex flex-col left-0 bg-white items-center justify-center" style="min-height: calc(100vh - 5rem);">
  <table>
    <tr class:inactive="{wizard.isBefore($wizard$, wizard.steps.CREATE_OR_JOIN_ROOM_SPACE)}">
      <td class="icon">
        {#if wizard.isAfter($wizard$, wizard.steps.CREATE_OR_JOIN_ROOM_SPACE)}&#x2611;{:else}&#x2610;{/if}
      </td>
      {#if wizard.isBefore($wizard$, wizard.steps.CREATE_OR_JOIN_ROOM_SPACE)}
        <td in:fade>
          Join room queue
          <p class="text-base text-gray-700">Room ID: <code>{params.id}</code></p>
        </td>
      {:else if wizard.isIn($wizard$, wizard.steps.CREATE_OR_JOIN_ROOM_SPACE, 'todo')}
        <td in:fade>
          <button
            class="bg-blue-500 hover:bg-blue-700 text-white px-1 rounded-lg focus:outline-none"
            on:click="{joinRoomQueue}"
          >
            Join room queue
          </button>
          <p class="text-base text-gray-700">Room ID: <code>{params.id}</code></p>
        </td>
      {:else if wizard.isIn($wizard$, wizard.steps.CREATE_OR_JOIN_ROOM_SPACE, 'doing')}
        <td in:fade>
          <span class="loading">Joining room queue</span>
          <p class="text-base text-gray-700"></p>
          <p class="text-base text-gray-700">
            Room ID:
            <code>{params.id}</code>
            <br />
            <strong>Connecting to room host</strong>
          </p>
        </td>
      {:else if wizard.isAfter($wizard$, wizard.steps.CREATE_OR_JOIN_ROOM_SPACE)}
        <td in:fade>
          Joined room queue
          <p class="text-base text-gray-700">Room ID: <code>{params.id}</code></p>
        </td>
      {/if}
    </tr>
    <tr class:inactive="{wizard.isBefore($wizard$, wizard.steps.ROOM_SETTINGS)}">
      <td class="icon">
        {#if wizard.isAfter($wizard$, wizard.steps.ROOM_SETTINGS)}&#x2611;{:else}&#x2610;{/if}
      </td>
      {#if wizard.isBefore($wizard$, wizard.steps.ROOM_SETTINGS)}
        <td in:fade>Room settings</td>
      {:else if wizard.isIn($wizard$, wizard.steps.ROOM_SETTINGS)}
        <td in:fade>
          <div class:loading="{wizard.isIn($wizard$, wizard.steps.ROOM_SETTINGS, 'doing')}">Room settings</div>
        </td>
      {:else if wizard.isAfter($wizard$, wizard.steps.ROOM_SETTINGS)}
        <td in:fade>
          <div>Room settings</div>
          <SettingsForm
            readonly="{true}"
            minsPerSide="{$settings$.minsPerSide}"
            startingPosition="{$settings$.startingPosition}"
          />
        </td>
      {/if}
    </tr>
    <tr class:inactive="{wizard.isBefore($wizard$, wizard.steps.SAVE_SPOT)}">
      <td class="icon">
        {#if wizard.isAfter($wizard$, wizard.steps.SAVE_SPOT)}&#x2611;{:else}&#x2610;{/if}
      </td>
      {#if wizard.isBefore($wizard$, wizard.steps.SAVE_SPOT)}
        <td in:fade>Mark your spot</td>
      {:else if wizard.isIn($wizard$, wizard.steps.SAVE_SPOT)}
        <td in:fade>
          <div class:loading="{wizard.isIn($wizard$, wizard.steps.SAVE_SPOT, 'doing')}">Mark your spot</div>
          <SpotForm
            readonly="{wizard.isIn($wizard$, wizard.steps.SAVE_SPOT, 'doing')}"
            bind:name="{_spotName}"
            bind:avatar="{_spotAvatar}"
            bind:team="{_spotTeam}"
            bind:errors="{_spotErrors}"
          >
            <div class="w-full">
              <button
                class="{wizard.isIn($wizard$, wizard.steps.SAVE_SPOT, 'doing') ? 'bg-gray-700' : 'bg-blue-500 hover:bg-blue-600'}
                  text-white text-xl px-4 focus:outline-none rounded-lg"
                disabled="{wizard.isIn($wizard$, wizard.steps.SAVE_SPOT, 'doing')}"
                on:click="{markYourSpot}"
              >
                Mark my spot
              </button>
            </div>
          </SpotForm>
        </td>
      {:else if wizard.isAfter($wizard$, wizard.steps.SAVE_SPOT)}
        <td in:fade>
          <div>Marked your spot</div>
          <SpotForm
            readonly="{true}"
            name="{utils.getAttr($spots$, [$playerId$, 'name'])}"
            avatar="{utils.getAttr($spots$, [$playerId$, 'avatar'])}"
            team="{utils.getAttr($spots$, [$playerId$, 'team'])}"
          />
        </td>
      {/if}
    </tr>
    <tr class:inactive="{wizard.isBefore($wizard$, wizard.steps.WAIT_FOR_SPOTS)}">
      <td class="icon">
        {#if wizard.isAfter($wizard$, wizard.steps.WAIT_FOR_SPOTS)}&#x2611;{:else}&#x2610;{/if}
      </td>
      {#if Object.keys($spots$).length == 0}
        <td>Wait for others</td>
      {:else}
        <td in:fade>
          <div class:loading="{wizard.isIn($wizard$, wizard.steps.WAIT_FOR_SPOTS, 'doing')}">Waiting for others</div>
          <div class="w-full text-base">
            {#if wizard.isIn($wizard$, wizard.steps.WAIT_FOR_SPOTS)}
              <div in:fade class="mb-4">
                <span class="block p-1 tracking-wide text-gray-700 text-sm font-bold mb-1 bg-orange-300">
                  Share this invitation link
                </span>
                <input
                  value="{`${window.location.origin}/#/room/join/${$roomId$}`}"
                  readonly="{true}"
                  class="appearance-none block w-full bg-gray-200 text-gray-700 text-sm border-2 border-orange-300
                    rounded p-1 leading-tight focus:outline-none focus:bg-white focus:border-gray-500"
                  type="text"
                  on:click="{(e) => {
                    if (e == null || e.target == null) return;
                    e.target.focus();
                    e.target.select();
                  }}"
                />
              </div>
            {/if}
            <span class="block uppercase tracking-wide text-gray-700 text-xs font-bold mb-1">
              Spots reserved in room
            </span>
            {#if Object.keys($spots$).length < 4}
              <div out:fade class="text-base text-gray-700 mb-1">
                Need
                {4 - Object.keys($spots$).length}
                more player(s)
              </div>
            {/if}
            <ul class="text-base">
              {#each Object.keys($spots$).sort() as pid}
                <li in:fade class="flex items-center mb-2">
                  <Spot
                    name="{utils.getAttr($spots$, [pid, 'name'])}"
                    avatar="{utils.getAttr($spots$, [pid, 'avatar'])}"
                    team="{utils.getAttr($spots$, [pid, 'team'])}"
                  />
                  {#if utils.getAttr($spots$, [pid, 'gamen']) == $gamen$ + 1}
                    <span class="text-xs inline-block bg-green-200 rounded-sm px-2 py-1 ml-2">in sync</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        </td>
      {/if}
    </tr>
  </table>
</div>
