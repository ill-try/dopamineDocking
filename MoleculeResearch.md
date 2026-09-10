# Dopamine-D2 receptor model research

## Question

Which dopamine features can support an educational model of favorable or unfavorable contact with a dopamine D2 receptor pocket?

## Claims checked before coding

1. Protein-ligand binding is produced by many individually weak, noncovalent interactions. Relevant categories include ionic/electrostatic interactions, hydrogen bonds, van der Waals contacts, and hydrophobic interactions. Shape complementarity lets several contacts occur at once.
2. Dopamine contains an aromatic catechol ring (two hydroxyl groups) and a primary amine. PubChem reports a conjugate-acid pKa of about 8.93, so the amine is modeled as mostly protonated near physiological pH.
3. Experiments on the human D2 receptor found that removing the negative charge at Asp114 eliminated tested ligand binding, while Ser197 was important for agonist binding. This supports representing a negatively charged receptor patch and directional polar patches.
4. Dopamine-D2 molecular-dynamics work describes an ionic interaction with Asp114 and hydrogen bonds with Ser193 and Ser197. These contacts are used as the model's three specific matching features.

## Sources

- Alberts et al., _Molecular Biology of the Cell_, NCBI Bookshelf, “Protein Function”: https://www.ncbi.nlm.nih.gov/books/NBK26911/
- PubChem, Dopamine (CID 681): https://pubchem.ncbi.nlm.nih.gov/compound/Dopamine
- Neve et al. (1992), “Site-directed mutagenesis of the human dopamine D2 receptor,” PMID 1358663: https://pubmed.ncbi.nlm.nih.gov/1358663/
- Kling et al. (2016), “Comparative MD Simulations Indicate a Dual Role for Arg1323.50 in Dopamine-Dependent D2R Activation,” PMCID PMC4704829: https://pmc.ncbi.nlm.nih.gov/articles/PMC4704829/

## Model definition

The simulation represents four ideas through explicit functional-group replacements:

- **Charge complementarity:** primary ammonium receives +2.8 model units, N-methyl ammonium receives +2.6, and a neutral amine receives +0.25.
- **Directional polar contacts:** a correctly positioned hydroxyl receives +1.45 units. Methoxy receives +0.75 because the model treats it as a weaker oxygen-containing replacement; hydrogen receives 0 because the polar group is absent.
- **Aromatic/pocket fit:** the aromatic ring receives a modest +1.2 contribution.
- **Added methoxy size:** each methoxy group adds a small −0.3 fit penalty.

The compatibility score is the sum of these terms, clamped to a 0–6.9 range. Scores of at least 5.5 produce stable docking, scores from 4.5 to 5.49 produce transient contact, and lower scores do not stably dock. These are transparent teaching weights, not measured energies, forces, affinities, or probabilities.

Motion is intentionally categorical rather than a molecular trajectory. Dopamine locks in, N-methyldopamine settles with a small rocking motion, a methoxy analog follows an offset/grazing path, a one-OH analog slides along the pocket edge, and a neutral-tail custom analog is deflected. These paths make each rule visible; they are not calculated dynamics.

## What is grounded, simplified, and potentially misleading

Scientifically grounded: complementary charge, hydrogen-bonding capacity and geometry, steric fit, hydrophobic/aromatic packing, molecular motion, collision, and the cumulative nature of weak interactions all matter to binding.

Simplified: the receptor is a fixed 2D pocket; water, ions, protonation equilibria, receptor flexibility, ligand conformations, desolvation, entropy, kinetics, and downstream signaling are omitted. Brownian-like motion is only a visible random wiggle with a score-biased drift.

Potentially misleading if read literally: the displayed score is not binding free energy or affinity; the colored patches are not atom-sized; paths are not molecular trajectories; contacts do not prove receptor activation; and replacing a group can affect real molecules in more ways than the single rule shown here. The names 3-methoxytyramine, N-methyldopamine, and tyramine identify real structural alternatives, but their displayed scores and motions are properties of this model only.

## Prediction set

Predictions are recorded before simulation runs:

| Variant           | Predicted outcome | Reason                                                                               |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------ |
| Dopamine          | Stable dock       | Ionic contact, two polar contacts, and ring fit all align.                           |
| 3-Methoxytyramine | Stable dock       | One OH→OCH₃ replacement keeps a weaker oxygen contact and adds a small size penalty. |
| N-Methyldopamine  | Stable dock       | The positive tail remains but settles in a shifted, rocking pose.                    |
| Tyramine          | Transient contact | One OH→H replacement removes a polar anchor and produces an edge contact.            |

The in-app test compares these predictions with the result generated by the stated rules. Agreement validates the implementation of the educational model; it is not experimental validation of real D2 binding.
