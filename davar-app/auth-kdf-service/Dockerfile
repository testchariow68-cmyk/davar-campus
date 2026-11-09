# DAVAR Campus — service de hachage (davar-kdf)
#
# Image minimale, sans dépendance : Node 22 slim + le seul fichier server.mjs.
# Aucun secret n'est copié dans l'image : DAVAR_KDF_TOKEN est fourni à
# l'exécution (docker run -e … ou tableau de bord de l'hébergeur).
FROM node:22-slim

WORKDIR /app
COPY server.mjs ./

# Utilisateur non privilégié : le service n'a besoin d'aucune écriture disque.
USER node

ENV DAVAR_KDF_HOST=0.0.0.0 \
    DAVAR_KDF_ITERATIONS=600000 \
    DAVAR_KDF_DAILY_MAX=3000 \
    DAVAR_KDF_TRUST_PROXY=true

EXPOSE 8788

# Sonde sans secret : l'hébergeur peut vérifier que le service répond.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:8788/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
