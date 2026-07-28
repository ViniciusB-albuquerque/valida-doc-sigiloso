const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploy feito por (será o endereço da Vara):", deployer.address);

  const Factory = await ethers.getContractFactory("DocumentoSigilosoRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();

  console.log("DocumentoSigilosoRegistry implantado em:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
