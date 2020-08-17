import Home from "./pages/Home.svelte";
import RoomCreate from "./pages/Room/Create.svelte";
import RoomJoin from "./pages/Room/Join.svelte";
import Game from "./pages/Game/index.svelte";
import { wrap } from "svelte-spa-router";

type routeMeta = { location: string; path: string; component: any; title: string };

export const menu: routeMeta[] = [
  { location: "/", path: "/", component: Home, title: "Home" },
  { location: "/room/create", path: "/room/create/:id?", component: RoomCreate, title: "Create Room" },
  { location: "/room/join", path: "/room/join/:id?", component: RoomJoin, title: "Join Room" },
];

export const pages = [...menu, ...[{ location: "/game", path: "/game/:id", component: Game, title: "Game" }]];

export const routes = new Map(pages.map((page) => [page.path, wrap(page.component, page)]));
