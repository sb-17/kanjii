import SetCard from "../components/set-card/SetCard";
import sets from "../data/sets.json";
import "../styles/LearnPage.css";

export default function Learn() {
  return (
    <div className="sets-container">
      {sets.map((set) => (
        <SetCard key={set.id} set={set} />
      ))}
    </div>
  );
}
