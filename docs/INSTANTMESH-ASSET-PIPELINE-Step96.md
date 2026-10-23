# InstantMesh — Kano Life Asset Pipeline (Step 96)

InstantMesh remains part of the planned asset workflow for high-quality Adaidaita Sahu keke, naturally posed people, fuel station pieces, Kano buildings, and infrastructure reference assets.

This stage did **not** execute InstantMesh inference, download model weights, or produce any assets claimed to be InstantMesh-generated. Step 96 concentrates on coordinate consistency and actual road meshes using the existing Three.js runtime.

Recommended asset workflow:

1. Gather licensed reference photos/models for Kano-specific keke, roadside traders, pedestrians, fuel forecourts, and Kwankwasiyya flyover details.
2. Generate candidate meshes with InstantMesh in a suitable inference environment.
3. Retopologise/decimate, inspect normals and pivots, set a sane scale, and create animation rigs for people rather than relying on static A-pose assets.
4. Export GLB, test `ModelManager` paths, verify mobile triangle budgets and texture sizes, and retain procedural fallbacks.
5. Check that the keke's wheel axle direction, forward axis, and wheel animation agree with `Renderer3D.makeKeke()` before replacing the player model.

No dependency on InstantMesh is introduced into the browser build; its weights should not be shipped inside the static website.
