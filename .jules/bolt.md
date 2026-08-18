## 2024-05-15 - Three.js Object Allocation in Render Loop
**Learning:** Instantiating THREE.Quaternion and THREE.Euler objects inside the main animation loop (`requestAnimationFrame`) can cause garbage collection overhead and potential stuttering in React+Three.js apps.
**Action:** Always hoist math object instantiations outside the render loop and reuse them using `.set()` and `.copy()` when manipulating the camera or objects every frame.
