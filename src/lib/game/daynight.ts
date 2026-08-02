// Day/night cycle system: animated sun & moon, dynamic sky color, and
// time-of-day-driven lighting changes.

import * as THREE from 'three'

export class DayNightCycle {
  /** Time of day in [0, 1). 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  timeOfDay = 0.3 // start at early morning
  /** Seconds per full day (default 8 minutes = Minecraft's 20-min cycle compressed). */
  dayLength = 480
  paused = false

  private sun: THREE.DirectionalLight
  private moon: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private ambient: THREE.AmbientLight
  private sunMesh: THREE.Mesh
  private moonMesh: THREE.Mesh
  private stars: THREE.Points
  private scene: THREE.Scene

  constructor(scene: THREE.Scene) {
    this.scene = scene

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x6b7a55, 0.85)
    scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xfff4e0, 0.8)
    scene.add(this.sun)
    scene.add(this.sun.target)

    this.moon = new THREE.DirectionalLight(0xa0b8e0, 0.0)
    scene.add(this.moon)
    scene.add(this.moon.target)

    this.ambient = new THREE.AmbientLight(0xffffff, 0.35)
    scene.add(this.ambient)

    // Sun visual: a glowing yellow sphere far from the camera.
    const sunGeo = new THREE.SphereGeometry(8, 16, 16)
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false })
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat)
    scene.add(this.sunMesh)

    // Moon visual.
    const moonGeo = new THREE.SphereGeometry(6, 16, 16)
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe0e8f0, fog: false })
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat)
    scene.add(this.moonMesh)

    // Star field (visible at night).
    const starGeo = new THREE.BufferGeometry()
    const starCount = 400
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      // Place stars on a large sphere around the world.
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.5 // upper hemisphere only
      const r = 250
      starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = r * Math.cos(phi)
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
    })
    this.stars = new THREE.Points(starGeo, starMat)
    scene.add(this.stars)
  }

  /** Returns the sun's elevation angle in degrees (-90..90). Negative = below horizon. */
  getSunElevation(): number {
    // timeOfDay=0.25 -> sunrise (elevation=0), 0.5 -> noon (elevation=90), 0.75 -> sunset (0).
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2
    return Math.sin(angle) * 90
  }

  /** Returns true if it's currently night (sun below horizon). */
  isNight(): boolean {
    return this.getSunElevation() < 0
  }

  /** Returns a 0..1 darkness factor (0 = full day, 1 = full night). */
  getDarkness(): number {
    const elev = this.getSunElevation()
    if (elev >= 15) return 0
    if (elev <= -15) return 1
    return (15 - elev) / 30
  }

  update(dt: number, cameraPosition: THREE.Vector3): void {
    if (!this.paused) {
      this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1
    }

    // Sun position: orbit around the world.
    const sunAngle = (this.timeOfDay - 0.25) * Math.PI * 2 // 0 at sunrise
    const sunDist = 200
    const sunX = Math.cos(sunAngle) * sunDist
    const sunY = Math.sin(sunAngle) * sunDist
    const sunZ = 50
    this.sunMesh.position.set(cameraPosition.x + sunX, cameraPosition.y + sunY, cameraPosition.z + sunZ)
    this.sun.position.copy(this.sunMesh.position)
    this.sun.target.position.copy(cameraPosition)

    // Moon position is opposite the sun.
    const moonX = -sunX
    const moonY = -sunY
    this.moonMesh.position.set(cameraPosition.x + moonX, cameraPosition.y + moonY, cameraPosition.z + sunZ)
    this.moon.position.copy(this.moonMesh.position)
    this.moon.target.position.copy(cameraPosition)

    // Sky color: interpolate between day blue, sunset orange, night dark blue.
    const darkness = this.getDarkness()
    const skyDay = new THREE.Color(0x8fc4ff)
    const skySunset = new THREE.Color(0xff8844)
    const skyNight = new THREE.Color(0x0a1020)
    let skyColor: THREE.Color
    const elev = this.getSunElevation()
    if (elev > 5) {
      skyColor = skyDay
    } else if (elev > -5) {
      // Sunset/sunrise blend
      const t = (5 - elev) / 10
      skyColor = skyDay.clone().lerp(skySunset, t)
    } else {
      const t = Math.min(1, (-elev - 5) / 20)
      skyColor = skySunset.clone().lerp(skyNight, t)
    }
    this.scene.background = skyColor
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color = skyColor
    }

    // Light intensities based on time.
    const sunIntensity = Math.max(0, Math.sin(sunAngle)) * 0.9
    const moonIntensity = Math.max(0, -Math.sin(sunAngle)) * 0.25
    this.sun.intensity = sunIntensity
    this.moon.intensity = moonIntensity
    // Ambient + hemisphere dim at night.
    this.ambient.intensity = 0.35 * (1 - darkness * 0.7)
    this.hemi.intensity = 0.85 * (1 - darkness * 0.6)

    // Sun/moon visibility (hide when below horizon).
    this.sunMesh.visible = sunY > -20
    this.moonMesh.visible = sunY < 20

    // Stars fade in at night.
    const starMat = this.stars.material as THREE.PointsMaterial
    starMat.opacity = Math.max(0, darkness - 0.3) * 1.3
    this.stars.position.copy(cameraPosition)
    // Rotate stars slowly so they don't feel static.
    this.stars.rotation.y += dt * 0.005
  }

  /** Skip time to the next morning (used by creative mode "skip night"). */
  skipToMorning(): void {
    if (this.timeOfDay > 0.25 && this.timeOfDay < 0.75) return // already day
    this.timeOfDay = 0.25
  }

  dispose(): void {
    this.scene.remove(this.sun, this.moon, this.hemi, this.ambient, this.sunMesh, this.moonMesh, this.stars)
    this.sunMesh.geometry.dispose()
    ;(this.sunMesh.material as THREE.Material).dispose()
    this.moonMesh.geometry.dispose()
    ;(this.moonMesh.material as THREE.Material).dispose()
    this.stars.geometry.dispose()
    ;(this.stars.material as THREE.Material).dispose()
  }
}
