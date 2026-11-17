// ../pub-game-store/native/files/useFiles.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: deletion refuses Overdrive's own install, paths a running or queued download owns, and a package being installed.

import { useEffect, useMemo, useState } from 'react';
import { deletionTargets, scanDrive } from './scan.js';
import { getGame } from '../state/catalog.js';
import { BUSY, COMPLETE } from '../state/download-queue.js';
import { downloadQueue, shadowMountUp } from '../state/downloads.js';
import { mountedImages, shadowRequest, within2 } from '../state/shadowmount.js';
import { FileSystem, Http, Packages, Platform } from '@ps5-react/core';

  var TITLE2 = "PPSA99058";
  // The distributed image is Overdrive.exfat; older builds were named Overdrive-PPSA99058*.exfat.
  var OWN_IMAGE = new RegExp(`^Overdrive(?:-${TITLE2}.*)?\\.exfat$`, "i");
  // Packages the console is installing from this screen, and files being deleted, by path. Module-level,
  // so a task that outlives the screen (the install keeps running when the user leaves) still holds its lock.
  var installs = /* @__PURE__ */ new Set();
  var removals = /* @__PURE__ */ new Set();
  var overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  var kept = (reason, message) => Object.assign(new Error(message), { reason });
  function installedTitles() {
    try {
      return new Set(FileSystem.readDir("/user/app").map((entry2) => entry2.name));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  var owned = (job2) => [job2.artifact?.destination, job2.downloadDestination, job2.output, ...job2.packages ?? []];
  function finishedJobs(path) {
    try {
      const queue = downloadQueue();
      return { queue, jobs: queue.snapshot().filter((job2) => COMPLETE.includes(job2.state) && owned(job2).includes(path)) };
    } catch {
      return { queue: null, jobs: [] };
    }
  }
  // Every path a download that is queued, running, or deleting itself may still write to or read from.
  function busyPaths() {
    try {
      return downloadQueue().snapshot().filter((job2) => BUSY.includes(job2.state) || job2.state === "removing").flatMap((job2) => [
        ...owned(job2),
        job2.publishTo,
        job2.release?.parts ? job2.artifact?.directory : null,
        ...(job2.parts ?? []).map((part) => part.destination)
      ]).filter(Boolean);
    } catch {
      return [];
    }
  }
  // Where ShadowMount runs Overdrive from, or null when it does not know or is not running.
  async function ownInstall() {
    if (Platform.OS !== "ps5") return null;
    try {
      const info = await shadowRequest(Http, "games/info", { title_id: TITLE2 });
      return info?.path || null;
    } catch (error2) {
      if (error2.unreachable || /HTTP 404/.test(error2.message)) return null;
      throw new Error(`ShadowMount could not say where Overdrive runs from, so it was kept: ${error2.message}`);
    }
  }
  // Throws when deleting `file` would remove Overdrive itself or something another operation still uses.
  // Checked again after every await in remove(), since a download or install may start meanwhile.
  function guard(file, own, root2) {
    const targets = deletionTargets(file);
    const hits = (paths) => paths.some((path) => targets.some((target) => overlaps(target, path)));
    if (file.titleId === TITLE2 || file.kind === "images" && OWN_IMAGE.test(file.name) || own && within2(own, targets, root2))
      throw kept("files.keptOverdrive", `${file.path} is Overdrive's own install, so it was kept`);
    if (hits([...installs])) throw kept("files.keptInstalling", `${file.path} is being installed, so it was kept`);
    if (hits(busyPaths())) throw kept("files.keptBusy", `${file.path} belongs to a download that is still running, so it was kept`);
  }
  async function checkUnmounted(file, root2) {
    if (Platform.OS !== "ps5" || file.kind !== "images") return;
    let mounted;
    try {
      mounted = await mountedImages((route, body) => shadowRequest(Http, route, body), deletionTargets(file), root2);
    } catch (error2) {
      throw new Error(`ShadowMount could not say whether it is mounted, so it was kept: ${error2.message}`);
    }
    console.log(`[files] ${file.path}: ${mounted === null ? "ShadowMount is not running, so it is not mounted" : mounted.length ? `still mounted (${mounted.map((image) => image.path).join(", ")})` : "not mounted"}`);
    if (mounted?.length) throw new Error("ShadowMount still has it mounted, so it was kept. Close any game and try again.");
  }
  function useFiles(root2) {
    const [version2, setVersion] = (0, useState)(0);
    const rescan = () => setVersion((value) => value + 1);
    const files = (0, useMemo)(() => {
      const installed = installedTitles();
      return scanDrive(FileSystem, root2).map((file) => ({
        ...file,
        game: file.titleId ? getGame(file.titleId) ?? null : null,
        installed: Boolean(file.titleId && installed.has(file.titleId))
      }));
    }, [root2, version2]);
    const [installing, setInstalling] = (0, useState)(null);
    const [shadowMount, setShadowMount] = (0, useState)(true);
    (0, useEffect)(() => {
      let live = true;
      void shadowMountUp().then((up) => {
        if (live) setShadowMount(up);
      });
      return () => {
        live = false;
      };
    }, [version2]);
    const install = (file) => {
      if (installing && !installing.done && !installing.error) return;
      if (removals.has(file.path) || installs.has(file.path)) return;
      let task;
      try {
        task = Packages.install({ path: file.path, name: file.game?.title ?? file.name });
      } catch (error2) {
        setInstalling({ path: file.path, fraction: 0, error: error2.message });
        return;
      }
      installs.add(file.path);
      setInstalling({ path: file.path, fraction: 0 });
      task.subscribe((progress) => setInstalling((state) => state?.path === file.path ? { ...state, fraction: progress.total ? progress.written / progress.total : 0 } : state));
      task.done.then(
        () => {
          installs.delete(file.path);
          setInstalling((state) => ({ ...state, fraction: 1, done: true }));
          rescan();
        },
        (error2) => {
          installs.delete(file.path);
          setInstalling((state) => ({ ...state, error: error2.message }));
        }
      );
    };
    const remove = async (file) => {
      if (removals.has(file.path)) return;
      removals.add(file.path);
      try {
        const own = await ownInstall();
        guard(file, own, root2);
        const { queue, jobs } = finishedJobs(file.path);
        const image = jobs.find((job2) => job2.artifact.nextAction === "shadowmount");
        if (image) {
          await queue.deleteFromDisk(image.id);
          rescan();
          return;
        }
        await checkUnmounted(file, root2);
        guard(file, own, root2);
        for (const path of deletionTargets(file)) {
          if (!FileSystem.exists(path)) continue;
          try {
            await FileSystem.removeAsync(path);
          } catch (error2) {
            console.log(`[files] ${path} not deleted: ${error2.message}`);
            throw error2;
          }
          console.log(`[files] deleted ${path}`);
        }
        for (const job2 of jobs) queue.remove(job2.id);
        rescan();
      } catch (error2) {
        if (error2.reason) console.log(`[files] ${error2.message}`);
        throw error2;
      } finally {
        removals.delete(file.path);
      }
    };
    return { files, installing, install, remove, rescan, shadowMount };
  }

export { useFiles };
