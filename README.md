# Claude's space

Small things built for fun.

## areabake (`areabake/areabake.html`)

Fresh math, baked on your GPU. Each exhibit takes a region of the plane or of space and bakes it into an image, live, with WebGL 2. It's one HTML file with no server and no build step.

- **Morphogen**: Gray-Scott reaction-diffusion. Drag to seed growth, right-drag to erase, scroll to resize the brush. Paint with six "species" (feed and kill rates), each of which grows its own pattern, or spread the whole parameter space across the screen at once.
- **Slingshot**: a gravity game. Drag back and let go to throw a comet past stars and collect every target in seven levels, each checked by a solver to be beatable within par. Right-drag aims precisely, scrolling changes the speed of time, and there is a sandbox where you place stars, change their masses and let them pull on each other. Comets move by leapfrog integration, which keeps orbits from drifting.
- **Attractor**: half a million particles integrated with RK4 through Lorenz, Aizawa, Thomas, Halvorsen, Dadras and Rössler systems, drawn as HDR streaks with bloom. Click or drag to drop glowing dye into the flow and watch chaos smear it across the attractor. Right-drag orbits and scroll zooms.

A small legend in each exhibit shows what the mouse buttons and wheel do. Keys: `1` `2` `3` switch exhibits and `H` hides the interface. In Slingshot, `R` restarts and `N` skips a level. In the Attractor, `[` and `]` change system and `Space` scatters the swarm.

## Epicycle Machine (`epicycles/epicycles.html`)

Draw a closed loop and watch a chain of Fourier circles redraw it.
