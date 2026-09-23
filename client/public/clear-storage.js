
        // Función para limpiar el almacenamiento
        function clearStorage() {
            try {
                // Mostrar qué se está limpiando
                console.log('Limpiando localStorage...');
                console.log('Items antes de limpiar:', localStorage.length);
                
                // Limpiar localStorage
                localStorage.clear();
                
                // Limpiar sessionStorage
                sessionStorage.clear();
                
                // Limpiar cookies relacionadas con la aplicación
                document.cookie.split(";").forEach(function(c) { 
                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
                });
                
                console.log('Items después de limpiar:', localStorage.length);
                console.log('✓ Limpieza completada exitosamente');
                
                return true;
            } catch (error) {
                console.error('Error al limpiar el almacenamiento:', error);
                return false;
            }
        }

        // Función para redirigir al login
        function goToLogin() {
            window.location.href = '/login';
        }

        // Ejecutar limpieza al cargar la página
        window.addEventListener('load', function() {
            setTimeout(function() {
                const success = clearStorage();
                
                // Actualizar UI
                document.getElementById('spinner').style.display = 'none';
                document.getElementById('icon').textContent = success ? '✅' : '❌';
                document.getElementById('title').textContent = success 
                    ? '¡Limpieza Completada!' 
                    : 'Error al Limpiar';
                document.getElementById('status').innerHTML = success 
                    ? '<span class="success">El caché se ha limpiado exitosamente</span>' 
                    : 'Hubo un problema al limpiar el caché';
                document.getElementById('info').style.display = success ? 'block' : 'none';
                document.getElementById('redirectBtn').style.display = 'block';
                
                // Redirigir automáticamente después de 3 segundos si fue exitoso
                if (success) {
                    setTimeout(function() {
                        goToLogin();
                    }, 3000);
                }
            }, 1000);
        });
    
document.getElementById('redirectBtn').addEventListener('click', goToLogin);
