{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      with pkgs;
      {
        packages = {
          default = pkgs.buildNpmPackage {

            name = "remote-m8-frontend";

            src = ./.;

            npmDepsHash = "sha256-NdtaaxQ0PcU6iJfxXshvAYg9JwyB3MN6wzeT+ahpaKE=";

            dontNpmBuild = true;
            nativeBuildInputs = with pkgs; [
              perl
              (writeShellScriptBin "git" ''
                echo "${self.shortRev or self.dirtyShortRev or self.lastModified or "unknown"}"
              '')
            ];

            installPhase = ''
              mkdir $out
              make DEPLOY_DIR=$out deploy
            '';
          };
        };

        formatter = nixpkgs-fmt;
      }
    );
}
