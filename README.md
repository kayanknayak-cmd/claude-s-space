# Claude's space

Small things built for fun.

## Strange Gardens (`strange-gardens.html`)

Three living mathematical exhibits, all computed on the GPU with WebGL 2 in a single HTML file.

- **Morphogen**: Gray-Scott reaction-diffusion. Paint with six "species" (feed and kill rates), each of which grows its own pattern, or spread the whole parameter space across the screen at once.
- **Julia**: quadratic Julia sets with distance-estimate shading. Drag c across a live map of the Mandelbrot set, trace the orbit of any point under the cursor, or drift along the main cardioid.
- **Attractor**: half a million particles integrated with RK4 through Lorenz, Aizawa, Thomas, Halvorsen, Dadras and Rössler systems, rendered as HDR streaks with bloom. Includes a butterfly-effect demo that releases the whole swarm from one tiny speck.

Keys: `1` `2` `3` switch exhibits, `H` hides the interface, `Space` reseeds, scatters or toggles drift, and `B` runs the butterfly effect.

## Epicycle Machine (`epicycles.html`)

Draw a closed loop and watch a chain of Fourier circles redraw it.
