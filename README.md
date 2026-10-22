# Claude's space

Small things built for fun.

## areabake (`areabake.html`)

Fresh math, baked on your GPU. Each exhibit takes a region of the plane or of space and bakes it into an image, live, with WebGL 2. It's one HTML file with no server and no build step.

- **Morphogen**: Gray-Scott reaction-diffusion. Drag to seed growth, right-drag to erase, scroll to resize the brush. Paint with six "species" (feed and kill rates), each of which grows its own pattern, or spread the whole parameter space across the screen at once.
- **Julia**: the Mandelbrot set on the left is a map of every value of c. Hover over it and the Julia set on the right changes live; click to keep a value. Left-drag on the Julia set bends it by nudging c, hover traces the orbit of a point, right-drag (or Shift-drag, or a two-finger scroll) pans, and scrolling or pinching zooms either view.
- **Attractor**: half a million particles integrated with RK4 through Lorenz, Aizawa, Thomas, Halvorsen, Dadras and Rössler systems, drawn as HDR streaks with bloom. Click or drag to drop glowing dye into the flow and watch chaos smear it across the attractor. Right-drag orbits and scroll zooms.

A small legend in each exhibit shows what the mouse buttons and wheel do. Keys: `1` `2` `3` switch exhibits and `H` hides the interface. In the Attractor, `[` and `]` change system and `Space` scatters the swarm.

## Epicycle Machine (`epicycles.html`)

Draw a closed loop and watch a chain of Fourier circles redraw it.
