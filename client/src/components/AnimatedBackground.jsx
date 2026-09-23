/**
 * @file AnimatedBackground.jsx
 * @description Fondo animado con partículas usando Canvas API
 * 
 * Responsabilidades:
 * - Renderizar partículas animadas en un <canvas>
 * - Adaptar colores según el tema (isDarkMode)
 * - Conectar partículas cercanas con líneas (efecto de red)
 * - Responder a resize del viewport
 * 
 * Animación:
 * - 100 partículas con movimiento aleatorio
 * - Cada partícula tiene: posición (x, y), tamaño, velocidad (speedX, speedY), opacidad
 * - requestAnimationFrame para animación suave (60fps)
 * - Líneas de conexión entre partículas con distancia < 100px
 * 
 * Colores:
 * - Modo claro: primary-700 (79, 70, 229) con opacidad 0.2
 * - Modo oscuro: violet-500 (139, 92, 246) con opacidad 0.1
 * 
 * Estilos:
 * - position: fixed, inset-0, z-0 (detrás de todo el contenido)
 * - pointer-events: none (no interfiere con clicks)
 * 
 * Cleanup:
 * - cancelAnimationFrame al desmontar
 * - removeEventListener de resize
 */

import { useEffect, useRef } from 'react';
import { useThemeStore } from '../store/themeStore';

const AnimatedBackground = () => {
  const canvasRef = useRef(null);
  const { isDarkMode } = useThemeStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let particles = [];

    // Colores según el tema
    const particleColor = isDarkMode ? '139, 92, 246' : '79, 70, 229'; // violet-500 : primary-700
    const baseOpacity = isDarkMode ? 0.1 : 0.2; // Más opaco en modo claro

    // Configurar tamaño del canvas
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Clase para las partículas
    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.opacity = Math.random() * 0.4 + baseOpacity;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        // Rebotar en los bordes
        if (this.x > canvas.width || this.x < 0) {
          this.speedX *= -1;
        }
        if (this.y > canvas.height || this.y < 0) {
          this.speedY *= -1;
        }
      }

      draw() {
        ctx.fillStyle = `rgba(${particleColor}, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Crear partículas
    const initParticles = () => {
      particles = [];
      const numberOfParticles = Math.floor((canvas.width * canvas.height) / 15000);
      for (let i = 0; i < numberOfParticles; i++) {
        particles.push(new Particle());
      }
    };

    initParticles();

    // Conectar partículas cercanas
    const connectParticles = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 150) {
            const lineOpacity = isDarkMode ? 0.15 : 0.25;
            const opacity = (1 - distance / 150) * lineOpacity;
            ctx.strokeStyle = `rgba(${particleColor}, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    // Animación
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });

      connectParticles();

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDarkMode]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default AnimatedBackground;
