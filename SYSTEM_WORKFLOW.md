# System Overview & Workflow

## System Description
MECANET is a Point of Sale (POS) system designed for mechanical workshops. 

### Architecture & Deployment
- **Hybrid Capability**: Designed to run both in the cloud (Railway, Vercel, MongoDB Atlas) and locally.
- **Database**: Uses MongoDB Atlas for both cloud and local deployments (local instances connect to the cloud DB).
- **Workspace**: The current workspace corresponds to the GitHub repository source.

## Development & Release Workflow

### Making Changes
1.  **Implement Changes**: Make necessary code modifications.
2.  **Release**: ALWAYS execute `npm run release` after changes.
3.  **Comment**: Always include a comment describing the changes during the release process.

### Testing Workflow
1.  **Release**: Perform the release (which generates a versioned ZIP in `distribucion`).
2.  **Deploy/Test**:
    -   Navigate to the `distribucion` folder.
    -   Copy the content of the desired version (usually the latest).
    -   Alternatively, extract the ZIP in a separate directory.
3.  **Update/Start**:
    -   Run `INICIAR-MECANET.bat` (or `configurar-inicial`).
    -   These scripts detect version changes and allow updating the system in that directory.
